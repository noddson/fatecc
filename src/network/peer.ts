import type { Actor, Asset, Campaign } from '../domain/types';
import { campaignSchema, assetSchema, assertReferences, assertSafeObject } from '../storage/schema';
import { validateAssets } from '../storage/assets';
import { GrantStore, loadReconnect, saveReconnect } from './credentials';
import type { DeviceGrant } from './credentials';
import { projectCampaign } from './projection';
import {
  connectionRoute,
  DataTransport,
  decodeDescription,
  encodeDescription,
  finishIce,
  isRecord,
  validCommand,
} from './protocol';

export interface PendingJoin {
  peerId: string;
  name: string;
}
export interface DraftProposal {
  id: string;
  peerId: string;
  memberId: string;
  name: string;
  characterId: string;
  baseRevision: number;
  changes: { description?: string; notes?: string; extras?: string };
}
export interface PeerInfo {
  peerId: string;
  name: string;
  status: string;
  route: 'direct' | 'relay' | 'unknown';
  memberId?: string;
  characterIds: string[];
}
interface NetworkOptions {
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  onError?: (message: string) => void;
}
export interface HostOptions extends NetworkOptions {
  getCampaign: () => Campaign;
  onCommand: (command: unknown, actor: Actor) => Promise<Campaign>;
  onPendingJoin?: (joins: PendingJoin[]) => void;
  onPeers?: (peers: PeerInfo[]) => void;
  onDrafts?: (drafts: DraftProposal[]) => void;
  onGrant?: (grant: Omit<DeviceGrant, 'token'>) => Promise<void>;
}
interface HostPeer {
  pc: RTCPeerConnection;
  info: PeerInfo;
  control: DataTransport;
  assets: DataTransport;
  grant?: DeviceGrant;
  sentAssets: Set<string>;
  receivedAt: number[];
  snapshotQueue: Promise<void>;
  assetQueue: Promise<void>;
}
const defaultIce: RTCIceServer[] = [];
function rtcConfig(options: NetworkOptions): RTCConfiguration {
  return {
    iceServers: options.iceServers ?? defaultIce,
    iceTransportPolicy: options.iceTransportPolicy ?? 'all',
  };
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Connection failed.';
}

export class FatePeerHost {
  private peers = new Map<string, HostPeer>();
  private pending = new Map<string, PendingJoin>();
  private drafts = new Map<string, DraftProposal>();
  private grants: GrantStore;
  private commandQueue: Promise<void> = Promise.resolve();
  private socket?: WebSocket;
  private closed = false;
  private campaignId: string;
  readonly epoch = crypto.randomUUID();
  constructor(private options: HostOptions) {
    this.campaignId = options.getCampaign().id;
    this.grants = new GrantStore(this.campaignId);
  }
  private campaign(): Campaign {
    const campaign = this.options.getCampaign();
    if (campaign.id !== this.campaignId) {
      this.close();
      throw new Error('The active campaign changed. Start a new table for that campaign.');
    }
    return campaign;
  }
  get peerList(): PeerInfo[] {
    return [...this.peers.values()].map((p) => ({ ...p.info }));
  }
  get savedGrants(): Omit<DeviceGrant, 'token'>[] {
    return this.grants.list().map(({ token: _, ...grant }) => grant);
  }
  get pendingDrafts(): DraftProposal[] {
    return [...this.drafts.values()];
  }
  resolveDraft(id: string): void {
    this.drafts.delete(id);
    this.notify();
  }
  private error = (message: string) => this.options.onError?.(message);
  private notify(): void {
    this.options.onPeers?.(this.peerList);
    this.options.onPendingJoin?.([...this.pending.values()]);
    this.options.onDrafts?.(this.pendingDrafts);
  }

  setObservers(observers: Pick<HostOptions, 'onPendingJoin' | 'onPeers' | 'onError' | 'onDrafts'>): void {
    Object.assign(this.options, observers);
    this.notify();
  }
  async createOffer(peerId: string = crypto.randomUUID()): Promise<{ peerId: string; offer: string }> {
    if (this.closed) throw new Error('This session is closed. Start hosting again.');
    const active = [...this.peers.values()].filter(
      (p) => !['closed', 'failed', 'disconnected'].includes(p.info.status),
    );
    if (active.length >= 7) throw new Error('The table supports up to seven connected players.');
    const pc = new RTCPeerConnection(rtcConfig(this.options));
    const control = new DataTransport(
      pc.createDataChannel('fate-control', { ordered: true }),
      (value) => {
        void this.receive(peerId, value).catch((e) => this.error(errorText(e)));
      },
      this.error,
    );
    const assets = new DataTransport(
      pc.createDataChannel('fate-assets', { ordered: true }),
      () => {},
      this.error,
    );
    const peer: HostPeer = {
      pc,
      control,
      assets,
      info: { peerId, name: 'Connecting player', status: 'connecting', route: 'unknown', characterIds: [] },
      sentAssets: new Set(),
      receivedAt: [],
      snapshotQueue: Promise.resolve(),
      assetQueue: Promise.resolve(),
    };
    this.peers.set(peerId, peer);
    control.channel.addEventListener('close', () => {
      // SCTP closure is definitive for this session even while ICE still reports connected.
      peer.info.status = 'disconnected';
      this.pending.delete(peerId);
      pc.close();
      this.notify();
    });
    pc.onconnectionstatechange = () => {
      peer.info.status =
        pc.connectionState === 'connected'
          ? control.channel.readyState === 'closed'
            ? 'disconnected'
            : peer.grant
              ? 'connected'
              : 'awaiting-approval'
          : pc.connectionState;
      if (pc.connectionState === 'connected')
        void connectionRoute(pc)
          .then((route) => {
            peer.info.route = route;
            this.notify();
          })
          .catch(() => {});
      if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) this.pending.delete(peerId);
      this.notify();
    };
    assets.channel.addEventListener('open', () => {
      if (peer.grant) void this.sendSnapshot(peer);
    });
    this.notify();
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await finishIce(pc);
      return {
        peerId,
        offer: encodeDescription({
          version: 1,
          campaignId: this.campaign().id,
          peerId,
          description: pc.localDescription!,
        }),
      };
    } catch (error) {
      pc.close();
      this.peers.delete(peerId);
      this.notify();
      throw error;
    }
  }
  async acceptAnswer(peerId: string, answer: string): Promise<void> {
    const parsed = decodeDescription(answer, 'answer');
    const peer = this.peers.get(peerId);
    if (!peer || parsed.peerId !== peerId || parsed.campaignId !== this.campaign().id)
      throw new Error('This answer belongs to another invitation.');
    await peer.pc.setRemoteDescription(parsed.description);
  }
  async approve(peerId: string, name: string, characterIds: string[]): Promise<DeviceGrant> {
    const peer = this.peers.get(peerId);
    if (!peer || !this.pending.has(peerId) || peer.control.channel.readyState !== 'open')
      throw new Error('The player is no longer waiting to join.');
    const allowed = this.campaign()
      .characters.filter((c) => c.kind === 'pc' && c.visibility === 'shared')
      .map((c) => c.id);
    if (characterIds.some((id) => !allowed.includes(id)))
      throw new Error('Only shared player characters can be assigned.');
    const grant = this.grants.create(name.trim().slice(0, 100) || 'Player', characterIds);
    try {
      const { token: _, ...publicGrant } = grant;
      await this.options.onGrant?.(publicGrant);
      await this.admit(peer, grant);
      return grant;
    } catch (error) {
      this.grants.revoke(grant.memberId);
      throw error;
    }
  }
  private async admit(peer: HostPeer, grant: DeviceGrant): Promise<void> {
    peer.grant = grant;
    const actor = this.currentActor(grant);
    peer.info = {
      ...peer.info,
      memberId: grant.memberId,
      name: grant.name,
      characterIds: actor.characterIds,
      status: 'connected',
    };
    this.pending.delete(peer.info.peerId);
    await peer.control.send({
      type: 'approved',
      token: grant.token,
      memberId: grant.memberId,
      characterIds: actor.characterIds,
      epoch: this.epoch,
    });
    this.notify();
    await this.sendSnapshot(peer);
  }
  reject(peerId: string): void {
    const peer = this.peers.get(peerId);
    this.pending.delete(peerId);
    if (peer)
      void peer.control
        .send({ type: 'rejected', message: 'The GM declined this join request.' })
        .catch(() => {})
        .finally(() => {
          peer.pc.close();
          this.peers.delete(peerId);
          this.notify();
        });
    this.notify();
  }
  revoke(memberId: string): void {
    this.grants.revoke(memberId);
    for (const peer of this.peers.values())
      if (peer.grant?.memberId === memberId) {
        peer.grant = undefined;
        void peer.control
          .send({ type: 'rejected', message: 'The GM revoked access. Ask for a fresh invitation.' })
          .catch(() => {})
          .finally(() => peer.pc.close());
      }
    this.notify();
  }
  private async receive(peerId: string, value: unknown): Promise<void> {
    if (this.closed) return;
    const peer = this.peers.get(peerId);
    if (!peer || !isRecord(value)) return;
    const now = Date.now();
    peer.receivedAt = peer.receivedAt.filter((t) => now - t < 10_000);
    if (peer.receivedAt.length > 80) {
      peer.pc.close();
      return;
    }
    peer.receivedAt.push(now);
    if (value.type === 'hello') {
      if (peer.grant) return;
      if (typeof value.token === 'string') {
        const grant = this.grants.authenticate(value.token);
        if (!grant) {
          await peer.control.send({
            type: 'rejected',
            message:
              'This reconnect credential was revoked or is no longer valid. Clear the saved pairing and ask the GM to approve a new invitation.',
          });
          peer.pc.close();
          return;
        }
        await this.admit(peer, grant);
        return;
      }
      const name = typeof value.name === 'string' ? value.name.trim().slice(0, 100) : 'Player';
      this.pending.set(peerId, { peerId, name: name || 'Player' });
      peer.info.name = name || 'Player';
      peer.info.status = 'awaiting-approval';
      this.notify();
      return;
    }
    const grant = peer.grant && this.grants.authenticate(peer.grant.token);
    if (!grant) {
      await peer.control.send({ type: 'error', message: 'GM approval is required.' });
      return;
    }
    if (value.type === 'resync') {
      await this.sendSnapshot(peer);
      return;
    }
    if (
      value.type === 'assetsNeeded' &&
      Array.isArray(value.ids) &&
      value.ids.length <= 500 &&
      value.ids.every((id) => typeof id === 'string')
    ) {
      this.sendRequestedAssets(peer, grant, value.ids);
      return;
    }
    if (value.type === 'draft' && typeof value.id === 'string' && value.id.length <= 128) {
      if (
        typeof value.characterId !== 'string' ||
        !this.currentActor(grant).characterIds.includes(value.characterId) ||
        !Number.isInteger(value.baseRevision) ||
        (value.baseRevision as number) < 0 ||
        !isRecord(value.changes)
      ) {
        await peer.control.send({
          type: 'ack',
          id: value.id,
          ok: false,
          message: 'This character draft is not permitted.',
        });
        return;
      }
      const changes: DraftProposal['changes'] = {};
      for (const key of ['description', 'notes', 'extras'] as const)
        if (typeof value.changes[key] === 'string' && value.changes[key].length <= 100_000)
          changes[key] = value.changes[key];
      if (!Object.keys(changes).length || this.drafts.size > 50) {
        await peer.control.send({
          type: 'ack',
          id: value.id,
          ok: false,
          message: 'The draft is empty or too many drafts are awaiting review.',
        });
        return;
      }
      this.drafts.set(value.id, {
        id: value.id,
        peerId,
        memberId: grant.memberId,
        name: grant.name,
        characterId: value.characterId,
        baseRevision: value.baseRevision as number,
        changes,
      });
      this.notify();
      await peer.control.send({ type: 'ack', id: value.id, ok: true });
      return;
    }
    if (value.type !== 'command' || !validCommand(value.command)) return;
    const command = value.command;
    if (JSON.stringify(command).length > 100_000) {
      await peer.control.send({ type: 'ack', id: command.id, ok: false, message: 'Command is too large.' });
      return;
    }
    const process = async () => {
      if (this.closed) return;
      const currentGrant = this.grants.authenticate(grant.token);
      if (!currentGrant) {
        await peer.control.send({ type: 'ack', id: command.id, ok: false, message: 'Access was revoked.' });
        return;
      }
      // Identity always comes from the live grant. Claimed identities in command payloads carry no authority.
      try {
        await this.options.onCommand(command, this.currentActor(currentGrant));
        await peer.control.send({ type: 'ack', id: command.id, ok: true });
        await this.broadcast();
      } catch (error) {
        this.error(`Player action rejected: ${errorText(error)}`);
        await peer.control.send({
          type: 'ack',
          id: command.id,
          ok: false,
          message:
            'The action could not be applied. Refresh the table and ask the GM to review its rules or permissions.',
        });
        await this.sendSnapshot(peer);
      }
    };
    this.commandQueue = this.commandQueue.then(process).catch((error) => this.error(errorText(error)));
    await this.commandQueue;
  }
  async broadcast(): Promise<void> {
    await Promise.all(
      [...this.peers.values()]
        .filter((p) => p.grant && p.control.channel.readyState === 'open')
        .map((p) => this.sendSnapshot(p).catch((e) => this.error(errorText(e)))),
    );
  }
  private currentActor(grant: DeviceGrant): Actor {
    const campaign = this.campaign();
    const member = campaign.members.find((m) => m.id === grant.memberId && m.role === 'player');
    return {
      id: grant.memberId,
      role: 'player',
      characterIds: grant.characterIds.filter(
        (id) =>
          member?.characterIds.includes(id) &&
          campaign.characters.some(
            (c) => c.id === id && c.ownerId === grant.memberId && c.visibility === 'shared',
          ),
      ),
    };
  }
  private sendRequestedAssets(peer: HostPeer, grant: DeviceGrant, ids: string[]): void {
    if (this.closed) return;
    if (peer.assets.channel.readyState !== 'open') return;
    const requested = projectCampaign(this.campaign(), this.currentActor(grant)).assets.filter(
      (a) => ids.includes(a.id) && !peer.sentAssets.has(`${a.id}:${a.hash}`),
    );
    for (const asset of requested) peer.sentAssets.add(`${asset.id}:${asset.hash}`);
    peer.assetQueue = peer.assetQueue
      .then(async () => {
        if (
          this.closed ||
          !this.grants.authenticate(grant.token) ||
          peer.assets.channel.readyState !== 'open'
        )
          return;
        for (const requestedAsset of requested) {
          const asset = projectCampaign(this.campaign(), this.currentActor(grant)).assets.find(
            (a) => a.id === requestedAsset.id && a.hash === requestedAsset.hash,
          );
          if (this.closed || !asset || !this.grants.authenticate(grant.token)) continue;
          await peer.assets.send({ type: 'asset', asset });
        }
      })
      .catch((error) => {
        for (const asset of requested) peer.sentAssets.delete(`${asset.id}:${asset.hash}`);
        this.error(errorText(error));
      });
  }
  private sendSnapshot(peer: HostPeer): Promise<void> {
    const operation = peer.snapshotQueue.then(async () => {
      if (this.closed) return;
      const grant = peer.grant && this.grants.authenticate(peer.grant.token);
      if (!grant || peer.control.channel.readyState !== 'open') return;
      const actor = this.currentActor(grant);
      const projected = projectCampaign(this.campaign(), actor);
      const assets = projected.assets;
      projected.assets = assets.map((a) => ({ ...a, dataUrl: '' }));
      peer.info.characterIds = actor.characterIds;
      await peer.control.send({ type: 'permissions', characterIds: actor.characterIds });
      await peer.control.send({ type: 'snapshot', epoch: this.epoch, campaign: projected });
      // The recipient requests missing assets after receiving metadata, avoiding cross-channel ordering races.
    });
    peer.snapshotQueue = operation.catch(() => {});
    return operation;
  }
  async openRoom(url: string): Promise<string> {
    this.socket?.close();
    const socket = new WebSocket(url);
    this.socket = socket;
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The signaling server did not respond.')), 15_000);
      socket.onopen = () => socket.send(JSON.stringify({ type: 'host' }));
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Could not connect to the signaling service.'));
      };
      socket.onmessage = (event) => {
        let message: unknown;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!isRecord(message)) return;
        if (message.type === 'hosted' && typeof message.roomId === 'string') {
          clearTimeout(timeout);
          resolve(message.roomId);
        }
        if (message.type === 'join' && typeof message.peerId === 'string') {
          const peerId = message.peerId;
          void this.createOffer(peerId)
            .then(({ offer }) => socket.send(JSON.stringify({ type: 'offer', peerId, offer })))
            .catch((error) => this.error(errorText(error)));
        }
        if (
          message.type === 'answer' &&
          typeof message.peerId === 'string' &&
          typeof message.answer === 'string'
        )
          void this.acceptAnswer(message.peerId, message.answer).catch((error) =>
            this.error(errorText(error)),
          );
        if (message.type === 'error' && typeof message.message === 'string') {
          clearTimeout(timeout);
          reject(new Error(message.message));
          this.error(message.message);
        }
      };
    });
  }
  close(): void {
    this.closed = true;
    this.socket?.close();
    for (const peer of this.peers.values()) peer.pc.close();
    this.pending.clear();
    this.notify();
  }
}

export interface ClientOptions extends NetworkOptions {
  name: string;
  onCampaign: (campaign: Campaign) => void;
  onStatus?: (status: string) => void;
  onGrant?: (actor: Actor) => void;
}
export class FatePeerClient {
  private generation = 0;
  private pc?: RTCPeerConnection;
  private control?: DataTransport;
  private assetCache = new Map<string, Asset>();
  private pendingCampaign?: Campaign;
  private campaignId?: string;
  private memberId?: string;
  private characterIds: string[] = [];
  private approved = false;
  private socket?: WebSocket;
  private pendingCommands = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(private options: ClientOptions) {}
  setObservers(observers: Pick<ClientOptions, 'onStatus' | 'onError'>): void {
    Object.assign(this.options, observers);
  }
  get connected(): boolean {
    return this.approved && this.control?.channel.readyState === 'open';
  }
  get actor(): Actor | undefined {
    return this.memberId
      ? { id: this.memberId, role: 'player', characterIds: [...this.characterIds] }
      : undefined;
  }
  private error = (message: string) => this.options.onError?.(message);
  async acceptOffer(offer: string): Promise<string> {
    this.close();
    const generation = this.generation;
    const parsed = decodeDescription(offer, 'offer');
    this.campaignId = parsed.campaignId;
    const pc = new RTCPeerConnection(rtcConfig(this.options));
    this.pc = pc;
    this.options.onStatus?.('connecting');
    pc.onconnectionstatechange = () => {
      if (generation !== this.generation || this.pc !== pc) return;
      if (pc.connectionState === 'connected')
        this.options.onStatus?.(this.approved ? 'connected' : 'awaiting-approval');
      else {
        this.options.onStatus?.(pc.connectionState);
        if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) this.approved = false;
      }
    };
    pc.ondatachannel = (event) => {
      if (generation !== this.generation || this.pc !== pc) {
        event.channel.close();
        return;
      }
      if (event.channel.label === 'fate-control') {
        event.channel.addEventListener('close', () => {
          if (generation === this.generation && this.pc === pc) this.close();
        });
        this.control = new DataTransport(
          event.channel,
          (value) => {
            if (generation === this.generation && this.pc === pc)
              void this.receive(value).catch((error) => this.error(errorText(error)));
          },
          this.error,
        );
        const hello = () => {
          if (generation !== this.generation || this.pc !== pc) return;
          const credential = loadReconnect(parsed.campaignId);
          void this.control!.send({ type: 'hello', name: this.options.name, token: credential?.token }).catch(
            (error) => this.error(errorText(error)),
          );
        };
        if (event.channel.readyState === 'open') hello();
        else event.channel.addEventListener('open', hello, { once: true });
      } else if (event.channel.label === 'fate-assets') {
        new DataTransport(
          event.channel,
          (value) => {
            if (generation === this.generation && this.pc === pc)
              void this.receiveAsset(value).catch((error) => this.error(errorText(error)));
          },
          this.error,
        );
      } else event.channel.close();
    };
    await pc.setRemoteDescription(parsed.description);
    await pc.setLocalDescription(await pc.createAnswer());
    await finishIce(pc);
    if (generation !== this.generation || this.pc !== pc)
      throw new Error('This connection attempt was cancelled.');
    return encodeDescription({ ...parsed, description: pc.localDescription! });
  }
  private async receive(value: unknown): Promise<void> {
    if (!isRecord(value)) return;
    if (
      value.type === 'approved' &&
      typeof value.token === 'string' &&
      value.token.length === 64 &&
      typeof value.memberId === 'string' &&
      Array.isArray(value.characterIds) &&
      value.characterIds.every((id) => typeof id === 'string')
    ) {
      saveReconnect(this.campaignId!, { token: value.token, memberId: value.memberId });
      this.memberId = value.memberId;
      this.characterIds = value.characterIds;
      this.approved = true;
      this.options.onGrant?.(this.actor!);
      this.options.onStatus?.('connected');
    } else if (
      value.type === 'permissions' &&
      this.approved &&
      Array.isArray(value.characterIds) &&
      value.characterIds.every((id) => typeof id === 'string')
    ) {
      this.characterIds = value.characterIds;
      if (this.actor) this.options.onGrant?.(this.actor);
    } else if (value.type === 'snapshot' && this.approved) {
      assertSafeObject(value.campaign);
      const campaign = campaignSchema.parse(value.campaign);
      if (campaign.id !== this.campaignId) throw new Error('Received a snapshot for another campaign.');
      this.pendingCampaign = campaign;
      // Remove assets no longer visible from the live cache. Previously disclosed bytes cannot be recalled externally.
      const allowed = new Set(campaign.assets.map((a) => `${a.id}:${a.hash}`));
      for (const signature of this.assetCache.keys())
        if (!allowed.has(signature)) this.assetCache.delete(signature);
      this.publishIfReady();
      const missing = campaign.assets
        .filter((a) => !this.assetCache.has(`${a.id}:${a.hash}`))
        .map((a) => a.id);
      if (missing.length) await this.control!.send({ type: 'assetsNeeded', ids: missing });
    } else if (value.type === 'ack' && typeof value.id === 'string') {
      const pending = this.pendingCommands.get(value.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(value.id);
        if (value.ok === true) pending.resolve();
        else
          pending.reject(new Error(typeof value.message === 'string' ? value.message : 'Action rejected.'));
      }
    } else if (value.type === 'rejected' || value.type === 'error') {
      this.error(typeof value.message === 'string' ? value.message : 'Connection rejected.');
      if (value.type === 'rejected') this.close();
    }
  }
  private async receiveAsset(value: unknown): Promise<void> {
    if (!this.approved || !isRecord(value) || value.type !== 'asset') return;
    const generation = this.generation;
    assertSafeObject(value.asset);
    const asset = assetSchema.parse(value.asset) as Asset;
    if (!this.pendingCampaign?.assets.some((a) => a.id === asset.id && a.hash === asset.hash)) return;
    await validateAssets([asset]);
    if (
      generation !== this.generation ||
      !this.approved ||
      !this.pendingCampaign?.assets.some((a) => a.id === asset.id && a.hash === asset.hash)
    )
      return;
    this.assetCache.set(`${asset.id}:${asset.hash}`, asset);
    this.publishIfReady();
  }
  private publishIfReady(): void {
    if (!this.approved || !this.pendingCampaign) return;
    const campaign = structuredClone(this.pendingCampaign);
    const complete = campaign.assets.every((a) => this.assetCache.has(`${a.id}:${a.hash}`));
    campaign.assets = campaign.assets
      .filter((a) => this.assetCache.has(`${a.id}:${a.hash}`))
      .map((a) => ({ ...a, dataUrl: this.assetCache.get(`${a.id}:${a.hash}`)!.dataUrl }));
    const available = new Set(campaign.assets.map((a) => a.id));
    // Publish live rolls immediately while a new map downloads. References to incomplete images appear only once verified.
    if (campaign.bannerAssetId && !available.has(campaign.bannerAssetId)) {
      delete campaign.bannerAssetId;
      delete campaign.bannerPosition;
    }
    for (const character of campaign.characters)
      if (character.portraitAssetId && !available.has(character.portraitAssetId))
        delete character.portraitAssetId;
    for (const entry of campaign.world)
      if (entry.assetId && !available.has(entry.assetId)) delete entry.assetId;
    campaign.maps = campaign.maps.filter((map) =>
      map.revisions.every((revision) => available.has(revision.assetId)),
    );
    assertReferences(campaign);
    this.options.onCampaign(structuredClone(campaign));
    this.options.onStatus?.(complete ? 'connected' : 'syncing-assets');
  }
  sendCommand(command: unknown): Promise<void> {
    if (!this.connected || !validCommand(command))
      return Promise.reject(new Error('Join a live table before sending an action.'));
    if (this.pendingCommands.has(command.id))
      return Promise.reject(new Error('This action is already awaiting acknowledgement.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(command.id);
        reject(
          new Error(
            'No acknowledgement received. Reconnect and retry the same action identifier to avoid duplicate effects.',
          ),
        );
      }, 20_000);
      this.pendingCommands.set(command.id, { resolve, reject, timer });
      void this.control!.send({ type: 'command', command }).catch((error) => {
        clearTimeout(timer);
        this.pendingCommands.delete(command.id);
        reject(error);
      });
    });
  }
  proposeDraft(draft: Pick<DraftProposal, 'id' | 'characterId' | 'baseRevision' | 'changes'>): Promise<void> {
    if (!this.connected) return Promise.reject(new Error('Reconnect to submit a draft for review.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(draft.id);
        reject(
          new Error(
            'The host did not acknowledge this draft. Keep the local draft and retry after reconnecting.',
          ),
        );
      }, 20_000);
      this.pendingCommands.set(draft.id, { resolve, reject, timer });
      void this.control!.send({ type: 'draft', ...draft }).catch((error) => {
        clearTimeout(timer);
        this.pendingCommands.delete(draft.id);
        reject(error);
      });
    });
  }
  async joinRoom(url: string, roomId: string): Promise<void> {
    const socket = new WebSocket(url);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The signaling server did not respond.')), 20_000);
      socket.onopen = () => socket.send(JSON.stringify({ type: 'join', roomId: roomId.trim() }));
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Could not connect to the signaling service.'));
      };
      socket.onmessage = (event) => {
        let message: unknown;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!isRecord(message)) return;
        if (message.type === 'offer' && typeof message.offer === 'string') {
          // acceptOffer resets the RTC connection; preserve the signaling socket while creating the answer.
          this.socket = undefined;
          void this.acceptOffer(message.offer)
            .then((answer) => {
              this.socket = socket;
              socket.send(JSON.stringify({ type: 'answer', answer }));
              clearTimeout(timeout);
              resolve();
            })
            .catch((error) => {
              clearTimeout(timeout);
              reject(error);
            });
        }
        if (message.type === 'error' && typeof message.message === 'string') {
          clearTimeout(timeout);
          reject(new Error(message.message));
        }
      };
    });
  }
  clearPairing(): void {
    if (this.campaignId) localStorage.removeItem(`fate.client-grant.v1.${this.campaignId}`);
  }
  close(): void {
    this.generation++;
    this.approved = false;
    this.pendingCampaign = undefined;
    const pc = this.pc;
    const socket = this.socket;
    this.pc = undefined;
    this.control = undefined;
    this.socket = undefined;
    pc?.close();
    socket?.close();
    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timer);
      pending.reject(
        new Error('Disconnected. Accepted actions remain on the host; reconnect to synchronize.'),
      );
    }
    this.pendingCommands.clear();
    this.options.onStatus?.('disconnected');
  }
}
