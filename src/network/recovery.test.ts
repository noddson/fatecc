import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCampaign } from '../domain/defaults';
import { FatePeerClient, FatePeerHost, CONNECTION_TIMEOUT_MS, RESPONSE_TIMEOUT_MS } from './peer';
import { GrantStore, loadReconnect, saveReconnect } from './credentials';
import { observeResume } from './resume';

class Channel extends EventTarget {
  label = 'fate-control';
  readyState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  send = vi.fn();
  close() {
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
  }
  receive(value: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          id: crypto.randomUUID(),
          index: 0,
          total: 1,
          data: JSON.stringify(value),
        }),
      }),
    );
  }
  messages() {
    return this.send.mock.calls.map(([frame]) => JSON.parse(JSON.parse(frame).data));
  }
}
const connections: Peer[] = [];
class Peer {
  connectionState = 'new';
  iceGatheringState = 'complete';
  localDescription?: RTCSessionDescriptionInit;
  onconnectionstatechange?: () => void;
  ondatachannel?: (event: { channel: Channel }) => void;
  control = new Channel();
  constructor() {
    connections.push(this);
  }
  createDataChannel() {
    return this.control;
  }
  async createOffer() {
    return { type: 'offer' as const, sdp: 'test' };
  }
  async createAnswer() {
    return { type: 'answer' as const, sdp: 'test' };
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
  }
  async setRemoteDescription() {}
  async getStats() {
    return new Map();
  }
  change(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
  close() {
    this.change('closed');
  }
}
const values = new Map<string, string>();
beforeEach(() => {
  connections.length = 0;
  values.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('RTCPeerConnection', Peer);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('replacing abandoned invitations closes them immediately without revoking saved approvals', async () => {
  const campaign = createCampaign();
  const grants = new GrantStore(campaign.id);
  const saved = grants.create('Nick', []);
  const host = new FatePeerHost({ getCampaign: () => campaign, onCommand: async () => campaign });
  try {
    for (let i = 0; i < 10; i++) {
      await host.replaceInvitation(saved.memberId);
      expect(host.peerList).toHaveLength(1);
      expect(connections.slice(0, -1).every((pc) => pc.connectionState === 'closed')).toBe(true);
      expect(grants.authenticate(saved.token)?.memberId).toBe(saved.memberId);
    }
  } finally {
    host.close();
  }
});

it('stale credentials wait for explicit approval and a targeted retry renews the existing device entry', async () => {
  const campaign = createCampaign();
  const grants = new GrantStore(campaign.id);
  const saved = grants.create('Nick', []);
  const pending = vi.fn();
  const host = new FatePeerHost({
    getCampaign: () => campaign,
    onCommand: async () => campaign,
    onPendingJoin: pending,
  });
  try {
    const offer = await host.replaceInvitation(saved.memberId);
    const pc = connections.at(-1)!;
    pc.change('connected');
    pc.control.receive({ type: 'hello', name: 'Nick', token: '0'.repeat(64) });
    await vi.waitFor(() =>
      expect(pending).toHaveBeenLastCalledWith([expect.objectContaining({ needsReapproval: true })]),
    );
    expect(pc.connectionState).toBe('connected');
    expect(pc.control.messages().some((m) => ['approved', 'snapshot'].includes(m.type))).toBe(false);
    const replacement = await host.approve(offer.peerId, 'Nick', []);
    expect(replacement.memberId).toBe(saved.memberId);
    expect(replacement.token).not.toBe(saved.token);
    expect(grants.list()).toHaveLength(1);
    expect(grants.authenticate(saved.token)).toBeUndefined();
    // Revocation remains effective: a fresh invitation cannot auto-admit a revoked credential.
    host.revoke(replacement.memberId);
    const retry = await host.replaceInvitation();
    const next = connections.at(-1)!;
    next.change('connected');
    next.control.receive({ type: 'hello', name: 'Nick', token: replacement.token });
    await vi.waitFor(() =>
      expect(pending).toHaveBeenLastCalledWith([
        expect.objectContaining({ peerId: retry.peerId, needsReapproval: true }),
      ]),
    );
    expect(next.control.messages().some((m) => ['approved', 'snapshot'].includes(m.type))).toBe(false);
  } finally {
    host.close();
  }
});

it('reuses an answer for the same live invitation and expires an unanswered retry without losing identity', async () => {
  vi.useFakeTimers();
  const campaign = createCampaign();
  const credential = { token: 'a'.repeat(64), memberId: 'nick' };
  saveReconnect(campaign.id, credential);
  const client = new FatePeerClient({ name: 'Nick', onCampaign: vi.fn() });
  const offer = JSON.stringify({
    version: 1,
    campaignId: campaign.id,
    peerId: 'peer',
    description: { type: 'offer', sdp: 'test' },
  });
  try {
    const answer = await client.acceptOffer(offer);
    expect(await client.acceptOffer(offer)).toBe(answer);
    expect(connections).toHaveLength(1);
    expect(client.status).toBe('awaiting-host');
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS);
    expect(client.status).toBe('failed');
    expect(client.answerText).toBe('');
    expect(connections[0].connectionState).toBe('closed');
    expect(loadReconnect(campaign.id)).toEqual(credential);
  } finally {
    client.close();
  }
});

it('ends a host attempt that never opens after accepting the answer', async () => {
  vi.useFakeTimers();
  const campaign = createCampaign();
  const onError = vi.fn();
  const host = new FatePeerHost({ getCampaign: () => campaign, onCommand: async () => campaign, onError });
  try {
    const invitation = await host.createOffer();
    const answer = JSON.stringify({
      version: 1,
      campaignId: campaign.id,
      peerId: invitation.peerId,
      description: { type: 'answer', sdp: 'test' },
    });
    await host.acceptAnswer(invitation.peerId, answer);
    await host.acceptAnswer(invitation.peerId, answer);
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS);
    expect(host.peerList).toHaveLength(0);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  } finally {
    host.close();
  }
});

it('does not revoke an approved device when snapshot delivery fails', async () => {
  const campaign = createCampaign();
  const host = new FatePeerHost({ getCampaign: () => campaign, onCommand: async () => campaign });
  try {
    const offer = await host.createOffer();
    const pc = connections.at(-1)!;
    pc.change('connected');
    pc.control.receive({ type: 'hello', name: 'Nick' });
    pc.control.send.mockImplementation((raw) => {
      if (JSON.parse(JSON.parse(raw).data).type === 'snapshot') throw new Error('Phone disconnected');
    });
    await expect(host.approve(offer.peerId, 'Nick', [])).rejects.toThrow('Phone disconnected');
    const issued = pc.control.messages().find((message) => message.type === 'approved');
    expect(new GrantStore(campaign.id).authenticate(issued.token)?.memberId).toBe(issued.memberId);
    const retry = await host.replaceInvitation(issued.memberId);
    const replacement = connections.at(-1)!;
    replacement.change('connected');
    replacement.control.receive({ type: 'hello', name: 'Nick', token: issued.token });
    await vi.waitFor(() =>
      expect(host.peerList).toEqual([
        expect.objectContaining({ peerId: retry.peerId, memberId: issued.memberId, status: 'connected' }),
      ]),
    );
    expect(host.savedGrants).toHaveLength(1);
  } finally {
    host.close();
  }
});

it('requires a matching round trip after wake even if native WebRTC still says connected', async () => {
  vi.useFakeTimers();
  const campaign = createCampaign();
  const onCampaign = vi.fn();
  const client = new FatePeerClient({ name: 'Nick', onCampaign });
  try {
    await client.acceptOffer(
      JSON.stringify({
        version: 1,
        campaignId: campaign.id,
        peerId: 'peer',
        description: { type: 'offer', sdp: 'test' },
      }),
    );
    const pc = connections[0];
    pc.ondatachannel?.({ channel: pc.control });
    pc.change('connected');
    pc.control.receive({
      type: 'approved',
      token: 'a'.repeat(64),
      memberId: 'nick',
      characterIds: [],
      resyncAcknowledgements: true,
    });
    await client.resume();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(client.connected).toBe(false);
    expect(client.status).toBe('reconnecting');
    const probes = pc.control.messages().filter((message) => message.type === 'resync');
    expect(probes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(probes.map((message) => message.requestId)).size).toBe(1);
    // A suspended event loop gets a new recovery window when it runs again.
    vi.setSystemTime(Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(client.status).toBe('reconnecting');
    pc.control.receive({ type: 'snapshot', campaign });
    pc.control.receive({ type: 'resynced', requestId: 'from-an-earlier-attempt' });
    expect(client.connected).toBe(false);
    pc.control.receive({ type: 'resynced', requestId: probes[0].requestId });
    expect(client.connected).toBe(true);
    expect(client.status).toBe('connected');
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS);
    expect(client.connected).toBe(true);
    expect(onCampaign).toHaveBeenCalled();
  } finally {
    client.close();
  }
});

it('times out a silent open channel without losing pairing, allowing a replacement attempt', async () => {
  vi.useFakeTimers();
  const campaign = createCampaign();
  const client = new FatePeerClient({ name: 'Nick', onCampaign: vi.fn() });
  const offer = (peerId: string) =>
    JSON.stringify({
      version: 1,
      campaignId: campaign.id,
      peerId,
      description: { type: 'offer', sdp: 'test' },
    });
  try {
    await client.acceptOffer(offer('old'));
    const old = connections[0];
    old.ondatachannel?.({ channel: old.control });
    old.change('connected');
    old.control.receive({
      type: 'approved',
      token: 'a'.repeat(64),
      memberId: 'nick',
      characterIds: [],
      resyncAcknowledgements: true,
    });
    await client.resume();
    await vi.advanceTimersByTimeAsync(24_000);
    await client.resume(); // Duplicate wake events must not extend an unsuccessful attempt forever.
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS - 24_000);
    expect(client.status).toBe('failed');
    expect(old.connectionState).toBe('closed');
    expect(loadReconnect(campaign.id)?.memberId).toBe('nick');
    await client.acceptOffer(offer('new'));
    old.control.receive({ type: 'rejected', message: 'Late rejection from old session' });
    old.change('failed');
    expect(client.status).toBe('awaiting-host');
    expect(connections).toHaveLength(2);
  } finally {
    client.close();
  }
});

it('retains approval across a transient disconnect, blocks offline actions, and resyncs the same session', async () => {
  const campaign = createCampaign('Before sleep');
  const onCampaign = vi.fn();
  const client = new FatePeerClient({ name: 'Player', onCampaign });
  try {
    await client.acceptOffer(
      JSON.stringify({
        version: 1,
        campaignId: campaign.id,
        peerId: 'peer',
        description: { type: 'offer', sdp: 'test' },
      }),
    );
    const pc = connections[0];
    pc.ondatachannel?.({ channel: pc.control });
    pc.change('connected');
    pc.control.receive({ type: 'approved', token: 'a'.repeat(64), memberId: 'member', characterIds: [] });
    expect(client.connected).toBe(true);
    pc.change('disconnected');
    expect(client.connected).toBe(false);
    expect(client.status).toBe('reconnecting');
    await expect(client.sendCommand({ id: 'offline', type: 'roll' })).rejects.toThrow('Join a live table');
    const onStatus = vi.fn();
    client.setObservers({ onStatus });
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting');
    pc.change('connected');
    expect(client.connected).toBe(false);
    expect(client.actor?.id).toBe('member');
    await vi.waitFor(() =>
      expect(pc.control.messages()).toContainEqual(expect.objectContaining({ type: 'resync' })),
    );
    campaign.name = 'Changed while asleep';
    pc.control.receive({ type: 'snapshot', campaign });
    expect(client.connected).toBe(true);
    expect(onCampaign).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Changed while asleep' }));
    expect(connections).toHaveLength(1);
    pc.change('failed');
    expect(client.connected).toBe(false);
    expect(client.status).toBe('failed');
  } finally {
    client.close();
  }
});

it('keeps a pending GM approval through a recoverable interruption', async () => {
  const campaign = createCampaign();
  const host = new FatePeerHost({ getCampaign: () => campaign, onCommand: async () => campaign });
  try {
    const invite = await host.createOffer();
    const pc = connections[0];
    pc.change('connected');
    pc.control.receive({ type: 'hello', name: 'Player' });
    pc.change('disconnected');
    expect(host.peerList[0].status).toBe('reconnecting');
    pc.change('connected');
    await expect(host.approve(invite.peerId, 'Player', [])).resolves.toBeDefined();
    expect(host.savedGrants).toHaveLength(1);
    expect(host.peerList[0].status).toBe('connected');
    const internal = host as unknown as { peers: Map<string, { sentAssets: Set<string> }> };
    const sentAssets = internal.peers.get(invite.peerId)!.sentAssets;
    sentAssets.add('interrupted-image:hash');
    pc.control.receive({ type: 'resync' });
    await vi.waitFor(() => expect(sentAssets.size).toBe(0));
  } finally {
    host.close();
  }
});

it('resyncs after visibility, page restore, and network restoration, and removes observers on disconnect', async () => {
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
  vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('document', documentTarget);
  const resume = vi.fn();
  const stop = observeResume(resume);
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  expect(resume).not.toHaveBeenCalled();
  documentTarget.visibilityState = 'visible';
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  windowTarget.dispatchEvent(new Event('pageshow'));
  windowTarget.dispatchEvent(new Event('online'));
  documentTarget.dispatchEvent(new Event('resume'));
  expect(resume).toHaveBeenCalledTimes(4);
  stop();
  windowTarget.dispatchEvent(new Event('online'));
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  documentTarget.dispatchEvent(new Event('resume'));
  expect(resume).toHaveBeenCalledTimes(4);
});
