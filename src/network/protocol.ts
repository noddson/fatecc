const CHUNK_SIZE = 12_000;
const MAX_MESSAGE_LENGTH = 100 * 1024 * 1024;
const MAX_PENDING_MESSAGES = 8;
interface ChunkFrame {
  id: string;
  index: number;
  total: number;
  data: string;
}

/** Bound message size and use small frames, below normal WebRTC message-size limits. */
export class DataTransport {
  private queue = Promise.resolve();
  private incoming = new Map<string, { chunks: string[]; size: number; received: number; started: number }>();
  constructor(
    readonly channel: RTCDataChannel,
    private receive: (value: unknown) => void,
    private error: (message: string) => void,
  ) {
    channel.bufferedAmountLowThreshold = 64 * 1024;
    channel.addEventListener('message', (event) => this.handle(event.data));
  }
  send(value: unknown): Promise<void> {
    const text = JSON.stringify(value);
    if (text.length > MAX_MESSAGE_LENGTH)
      return Promise.reject(new Error('Message exceeds the transport size limit.'));
    const operation = this.queue.then(async () => {
      const id = crypto.randomUUID();
      const total = Math.max(1, Math.ceil(text.length / CHUNK_SIZE));
      for (let index = 0; index < total; index++) {
        await this.ready();
        this.channel.send(
          JSON.stringify({
            id,
            index,
            total,
            data: text.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
          } satisfies ChunkFrame),
        );
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  private ready(): Promise<void> {
    if (this.channel.readyState !== 'open') return Promise.reject(new Error('Connection is not open.'));
    if (this.channel.bufferedAmount < 256 * 1024) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = () => {
        clearTimeout(timeout);
        this.channel.removeEventListener('bufferedamountlow', low);
        this.channel.removeEventListener('close', closed);
      };
      const low = () => {
        finish();
        resolve();
      };
      const closed = () => {
        finish();
        reject(new Error('Connection closed during transfer.'));
      };
      const timeout = setTimeout(() => {
        finish();
        reject(new Error('Transfer stalled. Reconnect to retry.'));
      }, 30_000);
      this.channel.addEventListener('bufferedamountlow', low, { once: true });
      this.channel.addEventListener('close', closed, { once: true });
    });
  }
  private handle(raw: unknown): void {
    try {
      if (typeof raw !== 'string' || raw.length > 16_000) throw new Error('Invalid transport frame.');
      const frame = JSON.parse(raw) as ChunkFrame;
      if (
        typeof frame.id !== 'string' ||
        frame.id.length > 80 ||
        typeof frame.data !== 'string' ||
        frame.data.length > CHUNK_SIZE ||
        !Number.isInteger(frame.total) ||
        frame.total < 1 ||
        frame.total > Math.ceil(MAX_MESSAGE_LENGTH / CHUNK_SIZE) ||
        !Number.isInteger(frame.index) ||
        frame.index < 0 ||
        frame.index >= frame.total
      )
        throw new Error('Invalid transport frame.');
      for (const [id, entry] of this.incoming)
        if (Date.now() - entry.started > 60_000) this.incoming.delete(id);
      let entry = this.incoming.get(frame.id);
      if (!entry) {
        if (this.incoming.size >= MAX_PENDING_MESSAGES) throw new Error('Too many incomplete transfers.');
        entry = { chunks: new Array<string>(frame.total), size: 0, received: 0, started: Date.now() };
        this.incoming.set(frame.id, entry);
      }
      if (entry.chunks.length !== frame.total) throw new Error('Inconsistent transfer.');
      if (entry.chunks[frame.index] !== undefined) return;
      entry.chunks[frame.index] = frame.data;
      entry.received++;
      entry.size += frame.data.length;
      if (entry.size > MAX_MESSAGE_LENGTH) {
        this.incoming.delete(frame.id);
        throw new Error('Transfer is too large.');
      }
      if (entry.received === frame.total) {
        this.incoming.delete(frame.id);
        this.receive(JSON.parse(entry.chunks.join('')));
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : 'Invalid peer message.');
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function validCommand(value: unknown): value is { id: string; type: string; [key: string]: unknown } {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 128 &&
    typeof value.type === 'string'
  );
}
export async function dataUrlHash(dataUrl: string): Promise<string> {
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid image transfer.');
  const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}

export interface SignalingEnvelope {
  version: 1;
  campaignId: string;
  peerId: string;
  description: RTCSessionDescriptionInit;
}
export function encodeDescription(envelope: SignalingEnvelope): string {
  return JSON.stringify(envelope);
}
export function decodeDescription(text: string, expectedType: 'offer' | 'answer'): SignalingEnvelope {
  if (text.length > 256_000) throw new Error('Connection description is too large.');
  const parsed: unknown = JSON.parse(text);
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    typeof parsed.campaignId !== 'string' ||
    typeof parsed.peerId !== 'string' ||
    !isRecord(parsed.description) ||
    parsed.description.type !== expectedType ||
    typeof parsed.description.sdp !== 'string'
  )
    throw new Error(`Paste a valid ${expectedType} from Fate Companion.`);
  return parsed as unknown as SignalingEnvelope;
}
export async function finishIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timeout);
      pc.removeEventListener('icegatheringstatechange', listener);
    };
    const listener = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
        resolve();
      }
    };
    const timeout = setTimeout(() => {
      finish();
      reject(new Error('Connection discovery timed out. Check the STUN/TURN settings.'));
    }, 20_000);
    pc.addEventListener('icegatheringstatechange', listener);
  });
}
export async function connectionRoute(pc: RTCPeerConnection): Promise<'direct' | 'relay' | 'unknown'> {
  const reports = await pc.getStats();
  let route: 'direct' | 'relay' | 'unknown' = 'unknown';
  reports.forEach((report) => {
    if (
      report.type === 'candidate-pair' &&
      report.state === 'succeeded' &&
      (report.nominated || report.selected)
    ) {
      const local = reports.get(report.localCandidateId);
      const remote = reports.get(report.remoteCandidateId);
      route = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relay' : 'direct';
    }
  });
  return route;
}
