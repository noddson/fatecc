import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Download, Square, Upload } from 'lucide-react';
import { connectionQrImage, decodeConnectionInput, decodeQrPixels, type ConnectionKind } from '../network/qr';
import './ConnectionQr.css';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 24_000_000;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const describe = (kind: ConnectionKind) => (kind === 'offer' ? 'invitation' : 'response');
const capitalized = (kind: ConnectionKind) => (kind === 'offer' ? 'Invitation' : 'Response');
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The QR code could not be read. Try another image or paste the connection text.';

export function ConnectionQrDisplay({ text, kind }: { text: string; kind: ConnectionKind }) {
  const [result, setResult] = useState<{
    text: string;
    kind: ConnectionKind;
    image?: string;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    void connectionQrImage(text, kind).then(
      (image) => {
        if (active) setResult({ text, kind, image });
      },
      (error: unknown) => {
        if (active) setResult({ text, kind, error: message(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [text, kind]);
  const current = result?.text === text && result.kind === kind ? result : undefined;
  return (
    <div className="connection-qr-display">
      {current?.image ? (
        <>
          <img src={current.image} alt={`${capitalized(kind)} QR code`} className="connection-qr-image" />
          <a className="button" href={current.image} download={`fate-${describe(kind)}-qr.png`}>
            <Download size={16} aria-hidden="true" /> Download {describe(kind)} QR
          </a>
          <p>
            {kind === 'offer'
              ? 'The player scans this invitation from Join a table. Create a separate invitation for each player.'
              : 'The GM scans this response from Host a table, then connects and approves your device.'}{' '}
            Keep this connection open while you exchange the codes.
          </p>
        </>
      ) : current?.error ? (
        <p className="connection-qr-error" role="alert">
          {current.error} Use the connection text below to copy and paste instead.
        </p>
      ) : (
        <p role="status">Preparing {describe(kind)} QR code…</p>
      )}
    </div>
  );
}

type ReaderPhase = 'idle' | 'requesting' | 'scanning' | 'image';

/** Reads locally and returns validated text; connecting still requires the user's next action. */
export function ConnectionQrReader({
  kind,
  onRead,
  disabled = false,
}: {
  kind: ConnectionKind;
  onRead: (text: string) => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<ReaderPhase>('idle');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);
  const phaseRef = useRef(phase);
  const kindRef = useRef(kind);
  const onReadRef = useRef(onRead);
  phaseRef.current = phase;
  onReadRef.current = onRead;

  const releaseCamera = useCallback(() => {
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    timerRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopCamera = useCallback(
    (reason = 'Camera stopped. You can upload a QR image or paste the connection text.') => {
      operationRef.current++;
      releaseCamera();
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
      if (mountedRef.current) {
        setPhase('idle');
        setStatus(reason);
      }
    },
    [releaseCamera],
  );

  useEffect(() => {
    mountedRef.current = true;
    const onVisibility = () => {
      if (
        document.visibilityState === 'hidden' &&
        (phaseRef.current === 'requesting' || phaseRef.current === 'scanning')
      ) {
        stopCamera('Camera stopped while the app was in the background. Start scanning again when ready.');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mountedRef.current = false;
      operationRef.current++;
      releaseCamera();
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [releaseCamera, stopCamera]);

  useEffect(() => {
    if (disabled) stopCamera('');
  }, [disabled, stopCamera]);

  useEffect(() => {
    if (kindRef.current !== kind) {
      kindRef.current = kind;
      stopCamera('');
      setError('');
    }
  }, [kind, stopCamera]);

  const fail = useCallback(
    (cause: unknown, operation: number) => {
      if (!mountedRef.current || operation !== operationRef.current) return;
      operationRef.current++;
      releaseCamera();
      setPhase('idle');
      setStatus('');
      setError(message(cause));
    },
    [releaseCamera],
  );

  const consume = useCallback(
    (text: string, operation: number) => {
      if (!mountedRef.current || operation !== operationRef.current) return;
      const decoded = decodeConnectionInput(text, kind);
      releaseCamera();
      operationRef.current++;
      setPhase('idle');
      setError('');
      setStatus(
        kind === 'offer'
          ? 'Invitation QR read. Review it below, then create your response.'
          : 'Response QR read. Review it below, then connect the player.',
      );
      onReadRef.current(decoded.text);
    },
    [kind, releaseCamera],
  );

  useEffect(() => {
    if (phase !== 'scanning' || !streamRef.current || !videoRef.current) return;
    const operation = operationRef.current;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      fail(
        new Error(
          'Camera scanning is unavailable in this browser. Upload a QR image or paste the connection text.',
        ),
        operation,
      );
      return;
    }
    video.srcObject = streamRef.current;
    video.scrollIntoView({ block: 'center' });
    const scan = () => {
      if (!mountedRef.current || operation !== operationRef.current) return;
      try {
        if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
          const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = decodeQrPixels(pixels.data, pixels.width, pixels.height);
          if (code) {
            consume(code, operation);
            return;
          }
        }
        timerRef.current = setTimeout(scan, 200);
      } catch (cause) {
        fail(cause, operation);
      }
    };
    void video.play().then(scan, (cause: unknown) => fail(cause, operation));
    return () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      timerRef.current = undefined;
    };
  }, [phase, consume, fail]);

  const startCamera = async () => {
    if (disabled) return;
    releaseCamera();
    const operation = ++operationRef.current;
    setError('');
    setStatus('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      fail(
        new Error(
          'Camera scanning needs HTTPS or localhost and a browser with camera support. Upload a QR image or paste the connection text.',
        ),
        operation,
      );
      return;
    }
    setPhase('requesting');
    setStatus('Waiting for camera permission…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
          aspectRatio: { ideal: 4 / 3 },
        },
      });
      if (
        !mountedRef.current ||
        operation !== operationRef.current ||
        document.visibilityState === 'hidden'
      ) {
        stream.getTracks().forEach((track) => track.stop());
        if (mountedRef.current && operation === operationRef.current) {
          stopCamera('Camera stopped while the app was in the background. Start scanning again when ready.');
        }
        return;
      }
      streamRef.current = stream;
      setPhase('scanning');
      setStatus(`Point the camera at the ${describe(kind)} QR code.`);
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : '';
      const explanation =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera access was denied. Allow camera access in your browser, or upload a QR image or paste the connection text.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No usable camera was found. Upload a QR image or paste the connection text.'
            : 'The camera could not start. It may be in use by another app. Upload a QR image or paste the connection text.';
      fail(new Error(explanation), operation);
    }
  };

  const readImage = async (file: File) => {
    if (disabled) return;
    releaseCamera();
    const operation = ++operationRef.current;
    setError('');
    setPhase('image');
    setStatus('Reading QR image…');
    let url: string | undefined;
    try {
      if (!IMAGE_TYPES.has(file.type)) throw new Error('Choose a PNG, JPEG, or WebP QR image.');
      if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('Choose a QR image smaller than 10 MB.');
      url = URL.createObjectURL(file);
      imageUrlRef.current = url;
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error('This image could not be opened. Choose a PNG, JPEG, or WebP image.'));
        image.src = url!;
      });
      if (!mountedRef.current || operation !== operationRef.current) return;
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS
      ) {
        throw new Error('Choose a QR image with no more than 24 megapixels.');
      }
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser cannot read QR images. Paste the connection text instead.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = decodeQrPixels(pixels.data, pixels.width, pixels.height);
      if (!code)
        throw new Error(
          'No readable QR code was found. Use a clear image containing the entire QR code, or paste the connection text.',
        );
      consume(code, operation);
    } catch (cause) {
      fail(cause, operation);
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (imageUrlRef.current === url) imageUrlRef.current = null;
    }
  };

  const cameraActive = phase === 'requesting' || phase === 'scanning';
  return (
    <div className="connection-qr-reader">
      <div className="actions connection-qr-actions">
        {cameraActive ? (
          <button type="button" onClick={() => stopCamera()}>
            <Square size={16} aria-hidden="true" /> Stop camera
          </button>
        ) : (
          <button type="button" disabled={disabled || phase === 'image'} onClick={() => void startCamera()}>
            <Camera size={16} aria-hidden="true" /> Scan {describe(kind)} QR
          </button>
        )}
        <label
          className={`button connection-qr-upload${disabled || phase === 'image' ? ' is-disabled' : ''}`}
        >
          <Upload size={16} aria-hidden="true" /> Upload {describe(kind)} QR image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={`Upload ${describe(kind)} QR image`}
            disabled={disabled || phase === 'image'}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void readImage(file);
            }}
          />
        </label>
      </div>
      {cameraActive && (
        <video
          ref={videoRef}
          className="connection-qr-camera"
          aria-label="QR scanner camera preview"
          muted
          playsInline
        />
      )}
      {status && (
        <p className="connection-qr-status" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="connection-qr-error" role="alert">
          {error}
        </p>
      )}
      <p className="connection-qr-help">
        Scanning and image reading happen on this device. You can also paste the connection text below.
      </p>
    </div>
  );
}
