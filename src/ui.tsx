import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { Actor, Campaign } from './domain/types';
import type { GameCommand } from './domain/commands';
type WithoutEnvelope<T> = T extends unknown ? Omit<T, 'id' | 'expectedRevision'> : never;
export interface EditorProps {
  campaign: Campaign;
  update: (change: (draft: Campaign) => void) => Promise<boolean>;
  dispatch: (command: WithoutEnvelope<GameCommand>) => Promise<boolean>;
  notify: (message: string, error?: boolean) => void;
  readOnly?: boolean;
  playerActor?: Actor;
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const controls = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]):not([hidden]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
        ) || [],
      ).filter((node) => node.getClientRects().length);
    const initial = el?.querySelector<HTMLElement>('[autofocus]') || controls()[0];
    initial?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const focusable = controls();
        const first = focusable[0],
          last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal ${wide ? 'wide' : ''}`}
      >
        <div className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function PageTitle({
  eyebrow,
  title,
  text,
  actions,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {text && <p className="subtitle">{text}</p>}
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}
export function ConfirmButton({
  onConfirm,
  children,
  title = 'Delete this item?',
  tooltip,
  message = 'This change will be saved to this device. Keep a backup if you may need to restore it.',
  className = 'icon-button danger',
}: {
  onConfirm: () => void;
  children?: ReactNode;
  title?: string;
  tooltip?: string;
  message?: string;
  className?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button
        className={className}
        onClick={() => setConfirm(true)}
        aria-label={title}
        title={tooltip || title}
      >
        {children ?? <Trash2 size={16} />}
      </button>
      {confirm && (
        <Modal title={title} close={() => setConfirm(false)}>
          <p>{message}</p>
          <div className="modal-actions">
            <button onClick={() => setConfirm(false)}>Cancel</button>
            <button
              className="button-danger"
              onClick={() => {
                onConfirm();
                setConfirm(false);
              }}
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="button-primary" onClick={onClick}>
      <Plus size={16} />
      {children}
    </button>
  );
}
export function downloadFile(content: string | Uint8Array, name: string, type = 'application/json') {
  const blob = new Blob([typeof content === 'string' ? content : new Uint8Array(content)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'campaign';
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '?';
export const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
