import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import {
  createRoomPeer,
  hostRoom,
  rotateRoom,
  parseRoomAddress,
  loadRoomByCode,
  loadRoom,
  saveRoom,
  signHost,
  verifyHost,
  type HostRoom,
  type RoomAddress,
  type SavedRoom,
} from './rooms';
import type { Actor, Asset, Campaign } from '../domain/types';
import { campaignSchema, assetSchema, assertReferences, assertSafeObject } from '../storage/schema';
import { validateAssets } from '../storage/assets';
import { GrantStore, loadReconnect, saveReconnect, clearReconnect, savePlayerName } from './credentials';
import type { DeviceGrant } from './credentials';
import { projectCampaign } from './projection';
import { observeResume } from './resume';
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
  needsReapproval?: boolean;
  replacesDevice?: string;
  characterIds?: string[];
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
  timer?: ReturnType<typeof setTimeout>;
  acceptedAnswer?: string;
  reconnectMemberId?: string;
}
export const CONNECTION_TIMEOUT_MS = 45_000;
export const RESPONSE_TIMEOUT_MS = 120_000;
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
  private roomPeer?: Peer;
  private roomIdentity?: HostRoom;
  private signalRetry?: ReturnType<typeof setInterval>;
  get roomCode(): string {
    return this.roomIdentity?.code ?? '';
  }
  get roomPublicKey(): string {
    return this.roomIdentity?.publicKey ?? '';
  }

  private campaignId: string;
  private stopObservingResume: () => void;
  readonly epoch = crypto.randomUUID();
  invitation?: { peerId: string; offer: string };
  constructor(private options: HostOptions) {
    this.campaignId = options.getCampaign().id;
    this.grants = new GrantStore(this.campaignId);
    this.stopObservingResume = observeResume(() => {
      if (!this.closed) {
        for (const peer of this.peers.values()) peer.sentAssets.clear();
        void this.broadcast();
      }
    });
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
  private removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    this.peers.delete(peerId);
    this.pending.delete(peerId);
    for (const [id, draft] of this.drafts) if (draft.peerId === peerId) this.drafts.delete(id);
    clearTimeout(peer.timer);
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    if (this.invitation?.peerId === peerId) this.invitation = undefined;
    this.notify();
  }
  private watchPeer(peer: HostPeer): void {
    clearTimeout(peer.timer);
    peer.timer = setTimeout(() => {
      if (this.peers.get(peer.info.peerId) !== peer) return;
      if (
        peer.pc.connectionState === 'connected' &&
        peer.control.channel.readyState === 'open' &&
        (peer.grant || this.pending.has(peer.info.peerId))
      )
        return;
      this.removePeer(peer.info.peerId);
      this.error(
        'The player connection timed out. Create a fresh invitation or choose Reconnect device. Saved approvals are unchanged.',
      );
    }, CONNECTION_TIMEOUT_MS);
  }
  async replaceInvitation(memberId?: string): Promise<{ peerId: string; offer: string }> {
    if (memberId && !this.savedGrants.some((grant) => grant.memberId === memberId && !grant.revoked))
      throw new Error('This device is no longer approved. Create a new player invitation.');
    if (this.invitation) this.removePeer(this.invitation.peerId);
    if (memberId)
      for (const peer of [...this.peers.values()])
        if (peer.grant?.memberId === memberId || peer.reconnectMemberId === memberId)
          this.removePeer(peer.info.peerId);
    const invitation = await this.createOffer();
    this.peers.get(invitation.peerId)!.reconnectMemberId = memberId;
    return invitation;
  }

  setObservers(observers: Pick<HostOptions, 'onPendingJoin' | 'onPeers' | 'onError' | 'onDrafts'>): void {
    Object.assign(this.options, observers);
    this.notify();
  }
  private attachTransport(
    peerId: string,
    pc: RTCPeerConnection,
    controlChannel: RTCDataChannel,
    assetChannel: RTCDataChannel,
  ): HostPeer {
    const control = new DataTransport(
      controlChannel,
      (value) => {
        void this.receive(peerId, value).catch((e) => this.error(errorText(e)));
      },
      this.error,
    );
    const assets = new DataTransport(assetChannel, () => {}, this.error);
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
      if (this.peers.get(peerId) !== peer) return;
      clearTimeout(peer.timer);
      // SCTP closure is definitive for this session even while ICE still reports connected.
      peer.info.status = 'disconnected';
      this.pending.delete(peerId);
      pc.close();
      this.notify();
    });
    pc.onconnectionstatechange = () => {
      if (this.peers.get(peerId) !== peer || this.closed) return;
      const wasReconnecting = peer.info.status === 'reconnecting';
      peer.info.status =
        pc.connectionState === 'connected'
          ? control.channel.readyState === 'closed'
            ? 'disconnected'
            : peer.grant
              ? 'connected'
              : 'awaiting-approval'
          : pc.connectionState === 'disconnected'
            ? 'reconnecting'
            : pc.connectionState;
      if (pc.connectionState === 'connected' && wasReconnecting && peer.grant) {
        peer.sentAssets.clear();
        void this.sendSnapshot(peer).catch((error) => this.error(errorText(error)));
      }
      if (pc.connectionState === 'connected')
        void connectionRoute(pc)
          .then((route) => {
            peer.info.route = route;
            this.notify();
          })
          .catch(() => {});
      if (['closed', 'failed'].includes(pc.connectionState)) this.pending.delete(peerId);
      if (pc.connectionState === 'disconnected') this.watchPeer(peer);
      if (['closed', 'failed'].includes(pc.connectionState)) {
        clearTimeout(peer.timer);
        peer.info.route = 'unknown';
      }
      if (pc.connectionState === 'connected' && (peer.grant || this.pending.has(peerId)))
        clearTimeout(peer.timer);
      this.notify();
    };
    assets.channel.addEventListener('open', () => {
      if (peer.grant) void this.sendSnapshot(peer);
    });
    this.notify();
    return peer;
  }
  async createOffer(peerId: string = crypto.randomUUID()): Promise<{ peerId: string; offer: string }> {
    if (this.closed) throw new Error('This session is closed. Start hosting again.');
    for (const peer of [...this.peers.values()])
      if (['closed', 'failed', 'disconnected'].includes(peer.info.status)) this.removePeer(peer.info.peerId);
    const active = [...this.peers.values()].filter(
      (p) => !['closed', 'failed', 'disconnected'].includes(p.info.status),
    );
    if (active.length >= 7) throw new Error('The table supports up to seven connected players.');
    const pc = new RTCPeerConnection(rtcConfig(this.options));
    const peer = this.attachTransport(
      peerId,
      pc,
      pc.createDataChannel('fate-control', { ordered: true }),
      pc.createDataChannel('fate-assets', { ordered: true }),
    );
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await finishIce(pc);
      if (this.closed || this.peers.get(peerId) !== peer || ['closed', 'failed'].includes(pc.connectionState))
        throw new Error('This invitation was cancelled. Create a fresh invitation.');
      const invitation = {
        peerId,
        offer: encodeDescription({
          version: 1,
          campaignId: this.campaign().id,
          peerId,
          description: pc.localDescription!,
        }),
      };
      this.invitation = invitation;
      peer.info.status = 'awaiting-answer';
      this.notify();
      return invitation;
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
    if (['closed', 'failed'].includes(peer.pc.connectionState))
      throw new Error('This invitation has closed. Create a fresh invitation.');
    if (peer.acceptedAnswer === answer) return;
    if (peer.acceptedAnswer)
      throw new Error('A different response was already used. Create a fresh invitation for this retry.');
    await peer.pc.setRemoteDescription(parsed.description);
    peer.acceptedAnswer = answer;
    if (this.invitation?.peerId === peerId) this.invitation = undefined;
    if (!peer.grant && !this.pending.has(peerId)) {
      peer.info.status = 'connecting';
      this.watchPeer(peer);
    }
    this.notify();
  }
  cancelInvitation(peerId: string): void {
    this.removePeer(peerId);
  }
  async approve(peerId: string, name: string, characterIds: string[]): Promise<DeviceGrant> {
    const peer = this.peers.get(peerId);
    if (!peer || !this.pending.has(peerId) || peer.control.channel.readyState !== 'open')
      throw new Error('The player is no longer waiting to join.');
    if (
      [...this.peers.values()].filter(
        (p) => p !== peer && p.grant && p.grant.memberId !== peer.reconnectMemberId,
      ).length >= 7
    )
      throw new Error('The table supports up to seven connected players.');
    const allowed = this.campaign()
      .characters.filter((c) => c.kind === 'pc' && c.visibility === 'shared')
      .map((c) => c.id);
    if (characterIds.some((id) => !allowed.includes(id)))
      throw new Error('Only shared player characters can be assigned.');
    const approvedName = name.trim().slice(0, 100) || 'Player';
    const grant = peer.reconnectMemberId
      ? this.grants.renew(peer.reconnectMemberId, approvedName, characterIds)
      : this.grants.create(approvedName, characterIds);
    try {
      const { token: _, ...publicGrant } = grant;
      await this.options.onGrant?.(publicGrant);
    } catch (error) {
      this.grants.revoke(grant.memberId);
      throw error;
    }
    // Once permission is saved, delivery failure is only a transport failure.
    // Revoking here would invalidate the credential the player may already have received.
    await this.admit(peer, grant);
    return grant;
  }
  private async admit(peer: HostPeer, grant: DeviceGrant): Promise<void> {
    if (this.closed || this.peers.get(peer.info.peerId) !== peer || !this.grants.authenticate(grant.token))
      throw new Error('This connection has closed. Reconnect the approved device.');
    if (
      [...this.peers.values()].filter((p) => p !== peer && p.grant && p.grant.memberId !== grant.memberId)
        .length >= 7
    ) {
      await peer.control.send({
        type: 'rejected',
        message: 'The table supports up to seven connected players. Try again when a place is free.',
      });
      this.removePeer(peer.info.peerId);
      return;
    }
    // One live session per approved device. Retire stale transports without revoking identity.
    for (const previous of [...this.peers.values()])
      if (previous !== peer && previous.grant?.memberId === grant.memberId)
        this.removePeer(previous.info.peerId);
    clearTimeout(peer.timer);
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
      name: grant.name,
      memberId: grant.memberId,
      characterIds: actor.characterIds,
      epoch: this.epoch,
      resyncAcknowledgements: true,
    });
    this.notify();
    await this.sendSnapshot(peer);
  }
  reject(peerId: string): void {
    const peer = this.peers.get(peerId);
    this.pending.delete(peerId);
    if (peer && peer.control.channel.readyState === 'open')
      void peer.control
        .send({ type: 'rejected', message: 'The GM declined this join request.' })
        .catch(() => {})
        .finally(() => {
          this.removePeer(peerId);
        });
    else this.removePeer(peerId);
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
    if (
      value.type === 'identify' &&
      this.roomIdentity &&
      typeof value.nonce === 'string' &&
      value.nonce.length === 36
    ) {
      const campaignId = this.campaign().id;
      const identity = this.roomIdentity;
      const signature = await signHost(
        identity,
        campaignId,
        value.nonce,
        peer.pc.localDescription?.sdp || '',
      );
      if (this.closed || this.peers.get(peerId) !== peer) return;
      await peer.control.send({
        type: 'host-identity',
        campaignId,
        publicKey: identity.publicKey,
        signature,
      });
      return;
    }
    if (value.type === 'hello') {
      if (peer.grant) return;
      if (typeof value.token === 'string') {
        const grant = this.grants.authenticate(value.token);
        if (!grant) {
          await peer.control.send({
            type: 'approval-required',
            message:
              'The saved pairing is no longer valid. This connection is waiting for fresh GM approval.',
          });
        } else {
          await this.admit(peer, grant);
          return;
        }
      }
      const name = typeof value.name === 'string' ? value.name.trim().slice(0, 100) : 'Player';
      if (this.closed || this.peers.get(peerId) !== peer) return;
      const previous = this.savedGrants.find((grant) => grant.memberId === peer.reconnectMemberId);
      clearTimeout(peer.timer);
      this.pending.set(peerId, {
        peerId,
        name: name || 'Player',
        needsReapproval: typeof value.token === 'string',
        replacesDevice: previous?.name,
        characterIds: previous?.characterIds,
      });
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
      // A suspended transfer may never have reached the player. Allow missing
      // assets to be requested again when the fresh snapshot arrives.
      peer.sentAssets.clear();
      await this.sendSnapshot(peer);
      if (typeof value.requestId === 'string' && value.requestId.length <= 128)
        await peer.control.send({ type: 'resynced', requestId: value.requestId });
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
      if (this.closed || this.peers.get(peerId) !== peer) return;
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
        .filter(
          (p) => p.grant && p.pc.connectionState === 'connected' && p.control.channel.readyState === 'open',
        )
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
      // The client evicts bytes omitted by this snapshot. Forget their delivery
      // here too, so sharing the same map or image again can transfer it afresh.
      const visibleAssets = new Set(assets.map((asset) => `${asset.id}:${asset.hash}`));
      for (const signature of peer.sentAssets)
        if (!visibleAssets.has(signature)) peer.sentAssets.delete(signature);
      projected.assets = assets.map((a) => ({ ...a, dataUrl: '' }));
      peer.info.characterIds = actor.characterIds;
      await peer.control.send({ type: 'permissions', characterIds: actor.characterIds });
      await peer.control.send({ type: 'snapshot', epoch: this.epoch, campaign: projected });
      // The recipient requests missing assets after receiving metadata, avoiding cross-channel ordering races.
    });
    peer.snapshotQueue = operation.catch(() => {});
    return operation;
  }
  async startPeerRoom(newCode = false): Promise<string> {
    if (this.closed) throw new Error('This table is closed. Start hosting again.');
    if (this.roomPeer?.open && !newCode) return this.roomCode;
    this.roomPeer?.destroy();
    clearInterval(this.signalRetry);
    const identity = await hostRoom(this.campaignId);
    if (this.closed) throw new Error('Hosting was cancelled.');
    this.roomIdentity = newCode ? rotateRoom(this.campaignId, identity) : identity;
    const broker = await createRoomPeer(this.roomCode, rtcConfig(this.options));
    if (this.closed) {
      broker.destroy();
      throw new Error('Hosting was cancelled.');
    }
    this.roomPeer = broker;
    broker.on('connection', (connection) => {
      if (
        this.closed ||
        this.roomPeer !== broker ||
        connection.label !== 'fate-control' ||
        connection.serialization !== 'raw'
      ) {
        connection.close();
        return;
      }
      connection.on('error', () => connection.close());
      const timeout = setTimeout(() => connection.close(), CONNECTION_TIMEOUT_MS);
      connection.on('close', () => clearTimeout(timeout));
      connection.on('open', () => {
        clearTimeout(timeout);
        if (this.closed || this.roomPeer !== broker) {
          connection.close();
          return;
        }
        for (const peer of [...this.peers.values()])
          if (['closed', 'failed', 'disconnected'].includes(peer.info.status))
            this.removePeer(peer.info.peerId);
        if (this.peers.size >= 14) {
          connection.close();
          this.error('The table supports up to seven connected players.');
          return;
        }
        const pc = connection.peerConnection;
        const peerId = crypto.randomUUID();
        const peer = this.attachTransport(
          peerId,
          pc,
          connection.dataChannel,
          pc.createDataChannel('fate-assets', { ordered: true }),
        );
        this.watchPeer(peer);
        void connectionRoute(pc)
          .then((route) => {
            if (this.peers.get(peerId) === peer) {
              peer.info.route = route;
              this.notify();
            }
          })
          .catch(() => {});
        connection.on('close', () => this.removePeer(peerId));
      });
    });
    this.signalRetry = setInterval(() => {
      if (!this.closed && broker.disconnected && !broker.destroyed) {
        try {
          broker.reconnect();
        } catch {
          /* Retry after network restoration. */
        }
      }
    }, 3_000);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        broker.destroy();
        reject(new Error('PeerJS did not respond. Check your internet connection and try again.'));
      }, CONNECTION_TIMEOUT_MS);
      broker.on('open', () => {
        clearTimeout(timeout);
        this.notify();
        resolve();
      });
      broker.on('close', () => {
        clearTimeout(timeout);
        reject(new Error('The room service connection closed. Start hosting again.'));
      });
      broker.on('error', (error) => {
        clearTimeout(timeout);
        const message =
          error.type === 'unavailable-id'
            ? 'This room code is already in use. Close other host tabs or choose New room code.'
            : 'Could not reach PeerJS. Check your internet connection and try again.';
        reject(new Error(message));
        if (!this.closed) this.error(message);
      });
    });
    return this.roomCode;
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
    clearInterval(this.signalRetry);
    this.roomPeer?.destroy();
    this.stopObservingResume();
    this.socket?.close();
    for (const peer of this.peers.values()) {
      clearTimeout(peer.timer);
      peer.pc.close();
    }
    this.invitation = undefined;
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
  private roomPeer?: Peer;
  private roomAddress?: RoomAddress;
  private verifiedRoom?: SavedRoom;
  private roomNonce?: string;
  private roomRetry?: ReturnType<typeof setInterval>;
  private stopRoomResume?: () => void;
  private roomAttempt = false;
  get roomCode(): string {
    return this.roomAddress?.code ?? '';
  }

  private pc?: RTCPeerConnection;
  private control?: DataTransport;
  private assetCache = new Map<string, Asset>();
  private pendingCampaign?: Campaign;
  private campaignId?: string;
  private memberId?: string;
  private characterIds: string[] = [];
  private approved = false;
  private socket?: WebSocket;
  private stopObservingResume?: () => void;
  private currentStatus = 'disconnected';
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private recoveryTimer?: ReturnType<typeof setInterval>;
  private recoveryId?: string;
  private resyncAcknowledgements = false;
  offerText = '';
  answerText = '';
  setName(name: string): void {
    this.options.name = name;
  }
  private failAttempt(message: string): void {
    if (this.roomAddress) {
      this.closeTransport();
      this.roomPeer?.destroy();
      this.roomAttempt = false;
      this.reportStatus('reconnecting');
      return;
    }
    this.close();
    this.reportStatus('failed');
    this.error(message);
  }
  private watchConnection(delay: number): void {
    clearTimeout(this.connectionTimer);
    this.connectionTimer = setTimeout(() => {
      if (this.connected) {
        void this.resume().catch((error) => this.error(errorText(error)));
        return;
      }
      this.failAttempt(
        'The connection timed out. Ask the GM to choose Reconnect device and exchange the new invitation and response. Your saved approval is retained.',
      );
    }, delay);
  }
  private pendingCommands = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(private options: ClientOptions) {}
  setObservers(observers: Pick<ClientOptions, 'onStatus' | 'onError'>): void {
    Object.assign(this.options, observers);
    this.options.onStatus?.(this.currentStatus);
  }
  get status(): string {
    return this.currentStatus;
  }
  get connected(): boolean {
    return (
      this.approved &&
      !this.recoveryId &&
      this.pc?.connectionState === 'connected' &&
      this.control?.channel.readyState === 'open'
    );
  }
  get actor(): Actor | undefined {
    return this.memberId
      ? { id: this.memberId, role: 'player', characterIds: [...this.characterIds] }
      : undefined;
  }
  private error = (message: string) => this.options.onError?.(message);
  private reportStatus(status: string): void {
    this.currentStatus = status;
    this.options.onStatus?.(status);
  }
  private finishRecovery(): void {
    clearInterval(this.recoveryTimer);
    this.recoveryTimer = undefined;
    this.recoveryId = undefined;
    if (this.connected) this.publishIfReady();
  }
  /** Require a round trip after wake: native "connected" can describe a dead path. */
  async resume(): Promise<void> {
    if (!this.approved || !this.pc || this.recoveryId) return;
    clearTimeout(this.connectionTimer);
    const requestId = crypto.randomUUID();
    this.recoveryId = requestId;
    this.reportStatus('reconnecting');
    let lastTick = Date.now();
    let deadline = lastTick + CONNECTION_TIMEOUT_MS;
    let sending = false;
    const probe = () => {
      if (this.recoveryId !== requestId) return;
      const now = Date.now();
      // Do not count this browser's own suspension as time spent trying to recover.
      if (
        now - lastTick > 10_000 ||
        (typeof document !== 'undefined' && document.visibilityState === 'hidden')
      )
        deadline = now + CONNECTION_TIMEOUT_MS;
      lastTick = now;
      if (now >= deadline) {
        this.failAttempt(
          'The host did not respond after waking. Ask the GM to choose Reconnect device and exchange the new codes. Your saved approval is retained.',
        );
        return;
      }
      if (sending || this.control?.channel.readyState !== 'open') return;
      sending = true;
      void this.control
        .send({ type: 'resync', requestId })
        .catch(() => {
          // Retry until the recovery deadline; a buffered send is not proof of recovery.
        })
        .finally(() => {
          sending = false;
        });
    };
    this.recoveryTimer = setInterval(probe, 3_000);
    probe();
  }
  async acceptOffer(offer: string): Promise<string> {
    const parsed = decodeDescription(offer, 'offer');
    if (
      this.offerText === offer &&
      this.answerText &&
      this.pc &&
      !['failed', 'closed'].includes(this.pc.connectionState)
    )
      return this.answerText;
    this.close();
    const generation = this.generation;
    this.offerText = offer;
    this.campaignId = parsed.campaignId;
    const pc = new RTCPeerConnection(rtcConfig(this.options));
    this.pc = pc;
    this.stopObservingResume = observeResume(() => {
      void this.resume().catch((error) => this.error(errorText(error)));
    });
    this.reportStatus('connecting');
    pc.onconnectionstatechange = () => {
      if (generation !== this.generation || this.pc !== pc) return;
      if (pc.connectionState === 'connected') {
        if (this.control?.channel.readyState === 'open') clearTimeout(this.connectionTimer);
        this.reportStatus(this.approved ? 'reconnecting' : 'awaiting-approval');
        void this.resume().catch((error) => this.error(errorText(error)));
      } else {
        // ICE disconnected is recoverable. Losing approval here strands a
        // restored connection because the host already admitted this peer.
        this.reportStatus(pc.connectionState === 'disconnected' ? 'reconnecting' : pc.connectionState);
        if (['closed', 'failed'].includes(pc.connectionState)) this.approved = false;
        if (pc.connectionState === 'disconnected') {
          if (this.approved) void this.resume();
          else this.watchConnection(CONNECTION_TIMEOUT_MS);
        }
        if (pc.connectionState === 'failed')
          this.failAttempt(
            'The connection failed. Ask the GM to choose Reconnect device. Your saved approval is retained.',
          );
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
          clearTimeout(this.connectionTimer);
          this.reportStatus('awaiting-approval');
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
    try {
      await pc.setRemoteDescription(parsed.description);
      await pc.setLocalDescription(await pc.createAnswer());
      await finishIce(pc);
    } catch (error) {
      if (generation === this.generation) this.failAttempt(errorText(error));
      throw error;
    }
    if (generation !== this.generation || this.pc !== pc)
      throw new Error('This connection attempt was cancelled.');
    this.answerText = encodeDescription({ ...parsed, description: pc.localDescription! });
    if (!this.control || this.control.channel.readyState !== 'open') {
      this.reportStatus('awaiting-host');
      this.watchConnection(RESPONSE_TIMEOUT_MS);
    }
    return this.answerText;
  }
  private async receive(value: unknown): Promise<void> {
    if (!isRecord(value)) return;
    if (this.roomAddress && !this.verifiedRoom) {
      if (
        value.type !== 'host-identity' ||
        typeof value.campaignId !== 'string' ||
        typeof value.publicKey !== 'string' ||
        typeof value.signature !== 'string' ||
        !this.roomNonce
      )
        return;
      const generation = this.generation;
      const address = this.roomAddress;
      const room: SavedRoom = {
        code: address.code,
        campaignId: value.campaignId,
        publicKey: value.publicKey,
      };
      const pinned = loadRoom(room.campaignId);
      const expectedKey = pinned?.publicKey || address.publicKey;
      const valid =
        (!address.campaignId || address.campaignId === room.campaignId) &&
        (!expectedKey || expectedKey === room.publicKey) &&
        (!address.publicKey || address.publicKey === room.publicKey) &&
        (await verifyHost(room, this.roomNonce, this.pc?.remoteDescription?.sdp || '', value.signature).catch(
          () => false,
        ));
      if (generation !== this.generation || this.roomAddress !== address) return;
      if (!valid) {
        this.close();
        this.reportStatus('failed');
        this.error(
          'The host identity does not match this saved table or QR link. Ask the GM for a new invitation.',
        );
        return;
      }
      this.verifiedRoom = room;
      clearTimeout(this.connectionTimer);
      this.campaignId = room.campaignId;
      const credential = loadReconnect(room.campaignId);
      await this.control!.send({ type: 'hello', name: this.options.name, token: credential?.token });
      this.reportStatus('awaiting-approval');
      return;
    }
    if (value.type === 'approval-required') {
      if (this.approved) return;
      if (this.campaignId) clearReconnect(this.campaignId);
      this.reportStatus('awaiting-approval');
      return;
    }
    if (
      value.type === 'approved' &&
      typeof value.token === 'string' &&
      value.token.length === 64 &&
      typeof value.memberId === 'string' &&
      Array.isArray(value.characterIds) &&
      value.characterIds.every((id) => typeof id === 'string')
    ) {
      saveReconnect(this.campaignId!, { token: value.token, memberId: value.memberId });
      if (this.verifiedRoom) {
        saveRoom(this.verifiedRoom);
        this.roomAddress = { ...this.verifiedRoom };
      }
      this.memberId = value.memberId;
      this.characterIds = value.characterIds;
      this.approved = true;
      if (typeof value.name === 'string') savePlayerName(value.name);
      this.resyncAcknowledgements = value.resyncAcknowledgements === true;
      this.options.onGrant?.(this.actor!);
      this.reportStatus('connected');
    } else if (value.type === 'resynced' && this.approved && value.requestId === this.recoveryId) {
      this.finishRecovery();
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
      // Older hosts acknowledge resync by returning their authorized snapshot.
      if (this.recoveryId && !this.resyncAcknowledgements) this.finishRecovery();
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
    if (this.connected) this.reportStatus(complete ? 'connected' : 'syncing-assets');
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
  async joinPeerRoom(input: string): Promise<void> {
    const parsed = parseRoomAddress(input);
    const saved = loadRoomByCode(parsed.code);
    if (saved && parsed.publicKey && saved.publicKey !== parsed.publicKey)
      throw new Error('This link does not match the saved host identity. Ask the GM for the correct link.');
    const address = saved ? { ...parsed, publicKey: saved.publicKey, campaignId: saved.campaignId } : parsed;
    this.close();
    this.roomAddress = address;
    this.roomRetry = setInterval(() => {
      void this.connectRoomAttempt();
    }, 3_000);
    this.stopRoomResume = observeResume(() => {
      if (this.connected) void this.resume();
      else void this.connectRoomAttempt();
    });
    await this.connectRoomAttempt();
  }
  private async connectRoomAttempt(): Promise<void> {
    if (!this.roomAddress || this.roomAttempt || this.connected || this.currentStatus === 'awaiting-approval')
      return;
    const address = this.roomAddress;
    this.roomAttempt = true;
    this.closeTransport();
    this.roomPeer?.destroy();
    const generation = this.generation;
    const broker = await createRoomPeer(undefined, rtcConfig(this.options));
    if (generation !== this.generation || this.roomAddress !== address) {
      broker.destroy();
      return;
    }
    this.roomPeer = broker;
    this.reportStatus('reconnecting');
    this.watchConnection(CONNECTION_TIMEOUT_MS);
    broker.on('connection', (connection) => connection.close());
    broker.on('error', () => {
      if (this.roomPeer === broker && this.roomAddress) this.failAttempt('Could not reach the host.');
    });
    broker.on('open', () => {
      if (generation !== this.generation || this.roomAddress !== address) return;
      const connection = broker.connect(address.code, {
        label: 'fate-control',
        serialization: 'raw',
        reliable: true,
      });
      this.attachRoomConnection(connection, generation);
    });
  }
  private attachRoomConnection(connection: DataConnection, generation: number): void {
    const pc = connection.peerConnection;
    this.pc = pc;
    // PeerJS owns the primary channel; use a separate native channel on the same
    // negotiated connection for images, preserving live-command responsiveness.
    const originalDataChannel = pc.ondatachannel;
    pc.ondatachannel = (event) => {
      if (generation !== this.generation) {
        event.channel.close();
        return;
      }
      if (event.channel.label === 'fate-assets') {
        new DataTransport(
          event.channel,
          (value) => {
            if (generation === this.generation)
              void this.receiveAsset(value).catch((error) => this.error(errorText(error)));
          },
          this.error,
        );
      } else originalDataChannel?.call(pc, event);
    };
    connection.on('error', () => {
      if (generation === this.generation) this.failAttempt('The connection failed.');
    });
    connection.on('close', () => {
      if (generation === this.generation) this.failAttempt('The host connection closed.');
    });
    pc.onconnectionstatechange = () => {
      if (generation !== this.generation) return;
      if (['failed', 'closed'].includes(pc.connectionState)) this.failAttempt('The connection failed.');
      else if (pc.connectionState === 'disconnected' && this.approved) void this.resume();
      else if (pc.connectionState === 'connected' && this.approved) void this.resume();
    };
    connection.on('open', () => {
      if (generation !== this.generation) {
        connection.close();
        return;
      }
      this.control = new DataTransport(
        connection.dataChannel,
        (value) => {
          if (generation === this.generation)
            void this.receive(value).catch((error) => this.failAttempt(errorText(error)));
        },
        this.error,
      );
      this.roomNonce = crypto.randomUUID();
      void this.control
        .send({ type: 'identify', nonce: this.roomNonce })
        .catch((error) => this.failAttempt(errorText(error)));
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
    if (this.campaignId) clearReconnect(this.campaignId);
  }
  close(): void {
    this.roomAddress = undefined;
    clearInterval(this.roomRetry);
    this.stopRoomResume?.();
    this.stopRoomResume = undefined;
    this.closeTransport();
    this.roomPeer?.destroy();
    this.roomPeer = undefined;
    this.roomAttempt = false;
  }
  private closeTransport(): void {
    this.generation++;
    this.verifiedRoom = undefined;
    this.roomNonce = undefined;
    clearTimeout(this.connectionTimer);
    clearInterval(this.recoveryTimer);
    this.recoveryTimer = undefined;
    this.recoveryId = undefined;
    this.resyncAcknowledgements = false;
    this.offerText = '';
    this.answerText = '';
    this.stopObservingResume?.();
    this.stopObservingResume = undefined;
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
    this.reportStatus('disconnected');
  }
}
