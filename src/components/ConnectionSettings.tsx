import { Field } from '../ui';
import {
  CLOUDFLARE_STUN_URL,
  CLOUDFLARE_TURN_URL,
  GOOGLE_STUN_URL,
  type ConnectionSettings,
} from '../network/connection-settings';
import './ConnectionSettings.css';

export interface ConnectionSettingsEditorProps {
  settings: ConnectionSettings;
  onChange: (settings: ConnectionSettings) => void;
  disabled: boolean;
}

export function ConnectionSettingsEditor({ settings, onChange, disabled }: ConnectionSettingsEditorProps) {
  const change = (values: Partial<ConnectionSettings>) => onChange({ ...settings, ...values });
  const hasTurn = settings.turnMode !== 'none';

  return (
    <div className="connection-settings">
      <p className="connection-settings-intro">
        Choose these settings on each device before pairing. STUN helps find a direct internet connection;
        TURN relays traffic when a direct connection is blocked. Settings stay in this tab until you reload
        and are never included in campaign exports.
      </p>
      <fieldset className="unframed connection-settings-fields" disabled={disabled}>
        <legend className="connection-settings-legend">Connection services</legend>
        <section className="connection-service">
          <Field label="STUN service">
            <select
              value={settings.stunMode}
              onChange={(event) => change({ stunMode: event.target.value as ConnectionSettings['stunMode'] })}
            >
              <option value="none">Local network only (no STUN)</option>
              <option value="cloudflare">Cloudflare STUN</option>
              <option value="google">Google STUN</option>
              <option value="custom">Custom STUN</option>
            </select>
          </Field>
          {settings.stunMode === 'none' && (
            <p className="connection-service-help">
              Use this option when everyone is on the same local network.
            </p>
          )}
          {settings.stunMode === 'cloudflare' && (
            <>
              <Field label="Cloudflare STUN server">
                <input className="connection-server-url" value={CLOUDFLARE_STUN_URL} readOnly />
              </Field>
              <p className="connection-service-help">
                Free, unlimited, and no account or credentials required.{' '}
                <a
                  href="https://developers.cloudflare.com/realtime/turn/faq/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Cloudflare STUN details
                </a>
              </p>
            </>
          )}
          {settings.stunMode === 'google' && (
            <>
              <Field label="Google STUN server">
                <input className="connection-server-url" value={GOOGLE_STUN_URL} readOnly />
              </Field>
              <p className="connection-service-help">
                Uses UDP port 19302. No account or credentials required.
              </p>
            </>
          )}
          {settings.stunMode === 'custom' && (
            <Field label="Custom STUN server" hint="Enter a stun: or stuns: server URL.">
              <input
                value={settings.customStun}
                onChange={(event) => change({ customStun: event.target.value })}
                placeholder="stun:your-server.example:3478"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          )}
        </section>

        <section className="connection-service">
          <Field label="TURN service">
            <select
              value={settings.turnMode}
              onChange={(event) => {
                const turnMode = event.target.value as ConnectionSettings['turnMode'];
                change({ turnMode, relayOnly: turnMode === 'none' ? false : settings.relayOnly });
              }}
            >
              <option value="none">No TURN relay</option>
              <option value="cloudflare">Cloudflare TURN</option>
              <option value="custom">Custom TURN</option>
            </select>
          </Field>
          {settings.turnMode === 'none' && (
            <p className="connection-service-help">
              Try STUN first. Add a TURN relay if players cannot connect across their networks.
            </p>
          )}
          {settings.turnMode === 'cloudflare' && (
            <Field label="Cloudflare TURN relay">
              <input className="connection-server-url" value={CLOUDFLARE_TURN_URL} readOnly />
            </Field>
          )}
          {settings.turnMode === 'custom' && (
            <Field label="Custom TURN relay" hint="Enter a turn: or turns: relay URL.">
              <input
                value={settings.customTurn}
                onChange={(event) => change({ customTurn: event.target.value })}
                placeholder="turns:your-server.example:443?transport=tcp"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          )}
          {hasTurn && (
            <div className="connection-credential-fields">
              <Field label="TURN username">
                <input
                  value={settings.turnUsername}
                  onChange={(event) => change({ turnUsername: event.target.value })}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field label="TURN credential">
                <input
                  type="password"
                  value={settings.turnCredential}
                  onChange={(event) => change({ turnCredential: event.target.value })}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
            </div>
          )}
          <div className="connection-relay-option">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.relayOnly}
                disabled={!hasTurn}
                onChange={(event) => change({ relayOnly: event.target.checked })}
              />
              Use relay only
            </label>
            <p className="connection-service-help">
              Send all session traffic through the selected TURN relay.
            </p>
          </div>
        </section>
      </fieldset>

      {settings.turnMode === 'cloudflare' && (
        <details className="connection-turn-help">
          <summary>Set up Cloudflare TURN</summary>
          <ol>
            <li>
              Create a TURN key in your Cloudflare account using the{' '}
              <a
                href="https://developers.cloudflare.com/realtime/turn/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cloudflare TURN documentation
              </a>
              .
            </li>
            <li>
              Follow Cloudflare’s{' '}
              <a
                href="https://developers.cloudflare.com/realtime/turn/generate-credentials/"
                target="_blank"
                rel="noopener noreferrer"
              >
                credential generation instructions
              </a>{' '}
              outside this public app to obtain a temporary username and credential. Keep the TURN key and API
              token outside the app; do not paste them into these fields.
            </li>
            <li>
              On each device, select Cloudflare TURN and paste the issued TURN username and credential before
              creating an invitation or response. Generate new credentials when they expire, then disconnect
              and pair again.
            </li>
          </ol>
          <p className="connection-service-help">
            You can also select Custom TURN and use your own provider’s relay address and credentials.
          </p>
        </details>
      )}
    </div>
  );
}
