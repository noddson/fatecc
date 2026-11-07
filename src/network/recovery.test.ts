import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCampaign } from '../domain/defaults';
import { FatePeerClient, FatePeerHost } from './peer';
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
  });
  vi.stubGlobal('RTCPeerConnection', Peer);
});
afterEach(() => vi.unstubAllGlobals());

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
    expect(client.connected).toBe(true);
    expect(client.actor?.id).toBe('member');
    await vi.waitFor(() => expect(pc.control.messages()).toContainEqual({ type: 'resync' }));
    campaign.name = 'Changed while asleep';
    pc.control.receive({ type: 'snapshot', campaign });
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
