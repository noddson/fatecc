import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Copy, Link, Radio, Unplug, Users } from 'lucide-react';
import type { Actor, Campaign } from '../domain/types';
import { Field, Modal, Badge, downloadFile } from '../ui';
import { FatePeerClient, FatePeerHost } from '../network/peer';
import type { DraftProposal, PeerInfo, PendingJoin } from '../network/peer';
import { decodeConnectionInput } from '../network/qr';
import { ConnectionQrDisplay, ConnectionQrReader } from './ConnectionQr';
import { ConnectionSettingsEditor } from './ConnectionSettings';
import { buildIceConfiguration, type ConnectionSettings } from '../network/connection-settings';
import { compareDraft, deleteDraft, listDrafts, makeDraft, saveDraft } from '../network/drafts';
import type { CharacterDraft } from '../network/drafts';
import { loadPlayerName, savePlayerName } from '../network/credentials';
import { MANUAL_PAIRING_ENABLED, loadRoom, initialRoomAddress, roomLink } from '../network/rooms';

export interface ConnectionPanelProps {
  campaign: Campaign | undefined;
  isPlayerView?: boolean;
  playerActor?: Actor;
  getCampaign: () => Campaign | undefined;
  onRemoteCampaign: (campaign: Campaign, actor?: Actor) => void;
  onDisconnect: () => void;
  onConnectionStatus?: (status: string) => void;
  onCommand: (command: unknown, actor: Actor) => Promise<Campaign>;
  hostRef: MutableRefObject<FatePeerHost | null>;
  clientRef: MutableRefObject<FatePeerClient | null>;
  settingsRef: MutableRefObject<ConnectionSettings>;
  notify: (text: string, error?: boolean) => void;
  close: () => void;
}

export function ConnectionPanel(props: ConnectionPanelProps) {
  const [tab, setTab] = useState<'host' | 'join' | 'drafts'>(
    props.isPlayerView || props.clientRef.current || initialRoomAddress() || !props.campaign
      ? 'join'
      : 'host',
  );
  const [status, setStatus] = useState(props.clientRef.current?.status ?? 'disconnected');
  const [peers, setPeers] = useState<PeerInfo[]>(props.hostRef.current?.peerList ?? []);
  const [joins, setJoins] = useState<PendingJoin[]>([]);
  const [proposals, setProposals] = useState<DraftProposal[]>(props.hostRef.current?.pendingDrafts ?? []);
  const [grants, setGrants] = useState(props.hostRef.current?.savedGrants ?? []);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [offer, setOffer] = useState(props.hostRef.current?.invitation?.offer ?? '');
  const [answer, setAnswer] = useState(props.clientRef.current?.answerText ?? '');
  const [incomingOffer, setIncomingOffer] = useState(props.clientRef.current?.offerText ?? '');
  const [incomingAnswer, setIncomingAnswer] = useState('');
  const [roomCode, setRoomCode] = useState(props.hostRef.current?.roomCode ?? '');
  const [roomInput, setRoomInput] = useState(
    () =>
      initialRoomAddress() ||
      props.clientRef.current?.roomCode ||
      loadRoom(props.isPlayerView ? props.campaign?.id : undefined)?.code ||
      '',
  );
  const [name, setName] = useState(loadPlayerName);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<ConnectionSettings>(() => ({ ...props.settingsRef.current }));
  const [drafts, setDrafts] = useState<CharacterDraft[]>(() => listDrafts(props.campaign?.id));
  const [draft, setDraft] = useState<CharacterDraft>();
  const [chosenCharacter, setSelectedCharacter] = useState('');
  const mounted = useRef(true);
  const failure = (message: string) => props.notify(message, true);
  const reportStatus = (value: string) => {
    if (mounted.current) {
      setStatus(value);
      if (value === 'connected') setName(loadPlayerName());
    }
    if (mounted.current && ['failed', 'closed', 'disconnected'].includes(value)) setAnswer('');
    props.onConnectionStatus?.(value);
  };
  const hostObservers = {
    onPendingJoin: (value: PendingJoin[]) => {
      if (mounted.current) setJoins(value);
    },
    onPeers: (value: PeerInfo[]) => {
      if (mounted.current) {
        setPeers(value);
        setRoomCode(props.hostRef.current?.roomCode ?? '');
        setGrants(props.hostRef.current?.savedGrants ?? []);
        setOffer(props.hostRef.current?.invitation?.offer ?? '');
      }
    },
    onDrafts: (value: DraftProposal[]) => {
      if (mounted.current) setProposals(value);
    },
    onError: failure,
  };
  useEffect(() => {
    mounted.current = true;
    props.hostRef.current?.setObservers(hostObservers);
    props.clientRef.current?.setObservers({ onStatus: reportStatus, onError: failure });
    return () => {
      mounted.current = false;
    };
    // A modal remount only replaces UI observers; live connection callbacks retain root-owned getters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      if (mounted.current) setRoomCode(props.hostRef.current?.roomCode ?? '');
      failure(error instanceof Error ? error.message : 'Connection failed.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const changeSettings = (next: ConnectionSettings) => {
    props.settingsRef.current = { ...next };
    setSettings(next);
  };
  const host = () => {
    if (props.isPlayerView)
      throw new Error('Open a locally owned campaign to host. This is a player reference copy.');
    if (props.hostRef.current) return props.hostRef.current;
    if (!props.getCampaign()) throw new Error('Open a campaign before hosting a table.');
    const configuration = buildIceConfiguration(settings);
    props.clientRef.current?.close();
    props.clientRef.current = null;
    const instance = new FatePeerHost({
      ...configuration,
      ...hostObservers,
      getCampaign: () => {
        const campaign = props.getCampaign();
        if (!campaign) throw new Error('The hosted campaign is no longer open.');
        return campaign;
      },
      onCommand: props.onCommand,
      onGrant: async (grant) => {
        await props.onCommand(
          {
            id: crypto.randomUUID(),
            type: 'assignPlayer',
            memberId: grant.memberId,
            name: grant.name,
            characterIds: grant.characterIds,
          },
          { id: 'gm', role: 'gm', characterIds: [] },
        );
      },
    });
    props.hostRef.current = instance;
    props.notify('Hosting from this browser. Keep the tab open while playing.');
    return instance;
  };
  const client = () => {
    const configuration = buildIceConfiguration(settings);
    savePlayerName(name.trim() || 'Player');
    if (props.clientRef.current) {
      props.clientRef.current.setName(name.trim() || 'Player');
      return props.clientRef.current;
    }
    props.hostRef.current?.close();
    props.hostRef.current = null;
    const instance = new FatePeerClient({
      ...configuration,
      name: name.trim() || 'Player',
      onStatus: reportStatus,
      onError: failure,
      onCampaign: (campaign) => props.onRemoteCampaign(campaign, instance.actor),
    });
    props.clientRef.current = instance;
    return instance;
  };
  const copy = (text: string) => {
    if (!navigator.clipboard?.writeText) {
      failure('Select and copy the text manually.');
      return;
    }
    void navigator.clipboard
      .writeText(text)
      .then(() => props.notify('Copied to clipboard.'))
      .catch(() => failure('Select and copy the text manually.'));
  };
  const stop = () => {
    props.hostRef.current?.close();
    props.clientRef.current?.close();
    props.hostRef.current = null;
    props.clientRef.current = null;
    setRoomCode('');
    setPeers([]);
    setJoins([]);
    setOffer('');
    setAnswer('');
    setIncomingOffer('');
    setIncomingAnswer('');
    props.onDisconnect();
    props.notify('Disconnected. Saved campaign data remains on this device.');
  };
  const refreshDrafts = () => setDrafts(listDrafts(props.campaign?.id));
  const playerActor = props.playerActor || props.clientRef.current?.actor;
  const assignedNames = (memberId: string, ids: string[]) =>
    (props.campaign?.characters || [])
      .filter(
        (c) =>
          c.ownerId === memberId &&
          ids.includes(c.id) &&
          props.campaign?.members.some((m) => m.id === memberId && m.characterIds.includes(c.id)),
      )
      .map((c) => c.name)
      .join(', ') || 'No character assigned';
  const availableCharacters = (props.campaign?.characters ?? []).filter(
    (c) => c.kind === 'pc' && (!props.isPlayerView || !!playerActor?.characterIds.includes(c.id)),
  );

  const selectedCharacter =
    availableCharacters.find((c) => c.id === chosenCharacter)?.id ||
    (props.isPlayerView ? availableCharacters[0]?.id || '' : '');

  return (
    <Modal title="Connect your table" close={props.close} wide>
      <p className="muted">
        Campaigns stay on your devices. The GM hosts the live session; everyone keeps an authorized local
        copy.
      </p>
      <p className="muted">
        {MANUAL_PAIRING_ENABLED
          ? 'Exchange an invitation and response QR, or copy and paste the connection text.'
          : 'Share a room code or QR link. Internet access starts the connection; game data travels between your browsers. Keep the GM’s tab open.'}
      </p>
      <div className="actions" style={{ marginBottom: 20 }}>
        <button
          className={tab === 'host' ? 'button-primary' : ''}
          disabled={props.isPlayerView}
          onClick={() => setTab('host')}
        >
          <Radio size={16} /> Host a table
        </button>
        <button className={tab === 'join' ? 'button-primary' : ''} onClick={() => setTab('join')}>
          <Link size={16} /> Join a table
        </button>
        <button className={tab === 'drafts' ? 'button-primary' : ''} onClick={() => setTab('drafts')}>
          Local drafts {drafts.length > 0 && `(${drafts.length})`}
        </button>
      </div>
      {tab !== 'drafts' && (
        <details className="connection-settings-details">
          <summary>Connection settings · STUN and TURN</summary>
          {(props.hostRef.current || props.clientRef.current) && (
            <p className="connection-settings-locked">Disconnect the table to edit connection settings.</p>
          )}
          <ConnectionSettingsEditor
            settings={settings}
            onChange={changeSettings}
            disabled={busy || !!props.hostRef.current || !!props.clientRef.current}
          />
        </details>
      )}
      {tab === 'host' && (
        <div className="stack">
          <div className="section-heading">
            <h3>
              <Users size={18} /> {props.campaign?.name ?? 'Open a campaign to host'}
            </h3>
            <Badge>{peers.filter((p) => p.status === 'connected').length} / 7 players</Badge>
          </div>
          {!MANUAL_PAIRING_ENABLED && (
            <section className="stack" aria-label="Table room">
              <div className="actions">
                <button
                  className="button-primary"
                  disabled={busy || !props.campaign || props.isPlayerView}
                  onClick={() =>
                    void run(async () => {
                      setRoomCode(await host().startPeerRoom());
                    })
                  }
                >
                  {busy ? 'Connecting…' : roomCode ? 'Resume hosting' : 'Start hosting'}
                </button>
                {roomCode && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setRoomCode(await host().startPeerRoom(true));
                      })
                    }
                  >
                    New room code
                  </button>
                )}
              </div>
              {roomCode && (
                <>
                  <Field
                    label="Room code"
                    hint="All players use this code. It also works for reconnection while you are hosting."
                  >
                    <input
                      aria-label="Room code"
                      readOnly
                      value={roomCode}
                      onFocus={(event) => event.target.select()}
                    />
                  </Field>
                  <div className="actions">
                    <button onClick={() => copy(roomCode)}>
                      <Copy size={16} /> Copy room code
                    </button>
                    <button onClick={() => copy(roomLink(roomCode, props.hostRef.current?.roomPublicKey))}>
                      <Copy size={16} /> Copy join link
                    </button>
                  </div>
                  <ConnectionQrDisplay
                    text={roomLink(roomCode, props.hostRef.current?.roomPublicKey)}
                    kind="room"
                  />
                </>
              )}
            </section>
          )}
          {MANUAL_PAIRING_ENABLED && (
            <>
              <div className="actions">
                <button
                  className="button-primary"
                  disabled={busy || !props.campaign || props.isPlayerView}
                  onClick={() =>
                    void run(async () => {
                      const invite = await host().replaceInvitation();
                      setOffer(invite.offer);
                      setIncomingAnswer('');
                    })
                  }
                >
                  {busy ? 'Connecting…' : 'Create player invitation'}
                </button>
              </div>
              {offer && (
                <>
                  <ConnectionQrDisplay text={offer} kind="offer" />
                  <details className="connection-text-fallback">
                    <summary>Copy/paste invitation</summary>
                    <Field
                      label="1. Send this offer to one player"
                      hint="Each player needs a separate invitation."
                    >
                      <textarea readOnly rows={4} value={offer} onFocus={(e) => e.target.select()} />
                    </Field>
                    <button onClick={() => copy(offer)}>
                      <Copy size={16} /> Copy offer
                    </button>
                  </details>
                </>
              )}
              <ConnectionQrReader
                key="response-reader"
                kind="answer"
                disabled={busy || !props.hostRef.current}
                onRead={(text) => setIncomingAnswer(text)}
              />
              <Field label="2. Paste the player's answer">
                <textarea
                  rows={3}
                  value={incomingAnswer}
                  onChange={(e) => setIncomingAnswer(e.target.value)}
                  placeholder="The player's connection answer…"
                />
              </Field>
              <button
                disabled={busy || !incomingAnswer.trim()}
                onClick={() =>
                  void run(async () => {
                    const parsed = decodeConnectionInput(incomingAnswer, 'answer');
                    if (!props.hostRef.current) throw new Error('Create an invitation first.');
                    await props.hostRef.current.acceptAnswer(parsed.envelope.peerId, parsed.text);
                    setIncomingAnswer('');
                    setOffer('');
                    props.notify('Answer accepted. Waiting for the player to connect.');
                  })
                }
              >
                Connect player
              </button>
            </>
          )}
          {joins.map((join) => (
            <section className="card" key={join.peerId} style={{ padding: 16, marginTop: 12 }}>
              <h3>{join.name} wants to join</h3>
              {join.replacesDevice && (
                <p>This will restore the saved device entry for {join.replacesDevice} after you approve.</p>
              )}
              {join.needsReapproval && (
                <p>The saved pairing could not be verified. Approve this device again to restore access.</p>
              )}
              <p>Choose the player characters this device may control.</p>
              {(props.campaign?.characters ?? [])
                .filter((c) => c.kind === 'pc' && c.visibility === 'shared')
                .map((c) => (
                  <label className="checkbox-row" key={c.id}>
                    <input
                      type="checkbox"
                      checked={(assignments[join.peerId] ?? join.characterIds ?? []).includes(c.id)}
                      onChange={(e) =>
                        setAssignments((values) => ({
                          ...values,
                          [join.peerId]: e.target.checked
                            ? [...(values[join.peerId] ?? join.characterIds ?? []), c.id]
                            : (values[join.peerId] ?? join.characterIds ?? []).filter((id) => id !== c.id),
                        }))
                      }
                    />
                    {c.name}
                  </label>
                ))}
              <div className="actions">
                <button
                  className="button-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await props.hostRef.current!.approve(
                        join.peerId,
                        join.name,
                        assignments[join.peerId] ?? join.characterIds ?? [],
                      );
                      props.notify(`${join.name} joined the table.`);
                    })
                  }
                >
                  Approve player
                </button>
                <button onClick={() => props.hostRef.current?.reject(join.peerId)}>Decline</button>
              </div>
            </section>
          ))}
          {(props.campaign?.members.filter((m) => m.role === 'player').length || 0) > 0 && (
            <section className="player-assignments" aria-label="Players and characters">
              <h3>Players & characters</h3>
              {props.campaign?.members
                .filter((m) => m.role === 'player')
                .map((member) => (
                  <p key={member.id}>
                    <strong>{assignedNames(member.id, member.characterIds)}</strong>
                    <small className="player-name">{member.name}</small>
                  </p>
                ))}
            </section>
          )}
          {peers.map((peer) => (
            <div
              className="list-row"
              key={peer.peerId}
              style={{ padding: '10px 0', display: 'flex', gap: 12, alignItems: 'center' }}
            >
              <strong>{peer.name}</strong>
              <Badge>{peer.status}</Badge>
              <span className="muted">{peer.route === 'unknown' ? '' : peer.route}</span>
              {!peer.memberId && (
                <button onClick={() => props.hostRef.current?.cancelInvitation(peer.peerId)}>
                  Cancel invitation
                </button>
              )}
            </div>
          ))}
          {grants.filter((g) => !g.revoked).length > 0 && (
            <details>
              <summary>Approved devices and revocation</summary>
              <p className="muted">
                These are saved permissions, not active connections. Reconnect device replaces its old
                connection while keeping its approval.
              </p>
              {grants
                .filter((g) => !g.revoked)
                .map((grant) => (
                  <div className="actions" key={grant.memberId} style={{ marginTop: 8 }}>
                    <span>
                      {grant.name} · {assignedNames(grant.memberId, grant.characterIds)}
                    </span>
                    {MANUAL_PAIRING_ENABLED && (
                      <button
                        aria-label={`Reconnect ${grant.name}`}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const invite = await host().replaceInvitation(grant.memberId);
                            setAssignments((current) => ({
                              ...current,
                              [invite.peerId]: grant.characterIds,
                            }));
                            setOffer(invite.offer);
                            setIncomingAnswer('');
                            props.notify(
                              `New invitation ready for ${grant.name}. Their saved approval is retained.`,
                            );
                          })
                        }
                      >
                        Reconnect device
                      </button>
                    )}
                    <button onClick={() => props.hostRef.current?.revoke(grant.memberId)}>
                      Revoke access
                    </button>
                  </div>
                ))}
            </details>
          )}
          {proposals.map((proposal) => {
            const character = props.campaign?.characters.find((c) => c.id === proposal.characterId);
            const stale = character?.revision !== proposal.baseRevision;
            return (
              <section className="card" key={proposal.id} style={{ padding: 16, marginTop: 12 }}>
                <h3>
                  Draft from {proposal.name}: {character?.name ?? 'Character'}
                </h3>
                {Object.entries(proposal.changes).map(([field, value]) => (
                  <div key={field}>
                    <strong>{field}</strong>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{value}</p>
                  </div>
                ))}
                {stale && (
                  <p className="notice">
                    This draft is based on an older character revision. Ask the player to compare it with the
                    latest sheet and submit a new draft.
                  </p>
                )}
                <div className="actions">
                  <button
                    className="button-primary"
                    disabled={busy || stale}
                    onClick={() =>
                      void run(async () => {
                        await props.onCommand(
                          {
                            id: crypto.randomUUID(),
                            type: 'applyDraft',
                            characterId: proposal.characterId,
                            baseRevision: proposal.baseRevision,
                            changes: proposal.changes,
                          },
                          { id: 'gm', role: 'gm', characterIds: [] },
                        );
                        props.hostRef.current?.resolveDraft(proposal.id);
                        await props.hostRef.current?.broadcast();
                        props.notify('Character draft applied.');
                      })
                    }
                  >
                    Accept changes
                  </button>
                  <button onClick={() => props.hostRef.current?.resolveDraft(proposal.id)}>Dismiss</button>
                </div>
              </section>
            );
          })}
        </div>
      )}
      {tab === 'join' && (
        <div className="stack">
          <div className="section-heading">
            <h3>Bring your character to the table</h3>
            <Badge>{status}</Badge>
          </div>
          {playerActor && props.isPlayerView && (
            <p>
              Playing as: <strong>{assignedNames(playerActor.id, playerActor.characterIds)}</strong>
            </p>
          )}
          {status === 'reconnecting' && (
            <p role="status">
              Checking the connection and refreshing the table. Keep this tab open; your saved approval is
              retained.
            </p>
          )}
          {MANUAL_PAIRING_ENABLED && status === 'awaiting-host' && (
            <p role="status">
              Show this response to the GM, who must scan it and select Connect player. If it expires, ask for
              a fresh invitation.
            </p>
          )}
          {status === 'awaiting-approval' && (
            <p role="status">Connected to the host. Waiting for the GM to approve your device if needed.</p>
          )}
          {(status === 'failed' ||
            status === 'closed' ||
            (status === 'disconnected' && props.isPlayerView)) && (
            <p role="status">
              {MANUAL_PAIRING_ENABLED
                ? 'The live connection has closed. Ask the GM to choose Reconnect device beside your name and exchange the new invitation and response. Your saved approval and cached campaign are retained; you do not need to clear the pairing.'
                : 'Use the same room code or select Reconnect. The GM must be hosting. Your saved approval and cached campaign are retained.'}
            </p>
          )}
          <Field label="Your name">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                savePlayerName(e.target.value);
              }}
              maxLength={100}
            />
          </Field>
          {!MANUAL_PAIRING_ENABLED && (
            <>
              <ConnectionQrReader kind="room" disabled={busy} onRead={setRoomInput} />
              <Field label="Room code or join link">
                <input
                  value={roomInput}
                  onChange={(event) => setRoomInput(event.target.value)}
                  placeholder="fatecore-K7MP4QTX"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </Field>
              <div className="actions">
                <button
                  className="button-primary"
                  disabled={busy || !roomInput.trim()}
                  onClick={() =>
                    void run(async () => {
                      await client().joinPeerRoom(roomInput);
                      props.notify('Looking for the GM. Keep this tab open.');
                    })
                  }
                >
                  Join table
                </button>
                {(loadRoom(props.campaign?.id) || roomInput) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const room = loadRoom(props.campaign?.id);
                        const address = room ? roomLink(room.code, room.publicKey) : roomInput;
                        setRoomInput(address);
                        await client().joinPeerRoom(address);
                      })
                    }
                  >
                    Reconnect
                  </button>
                )}
              </div>
            </>
          )}
          {MANUAL_PAIRING_ENABLED && (
            <>
              <ConnectionQrReader
                key="invitation-reader"
                kind="offer"
                disabled={busy}
                onRead={(text) => {
                  setIncomingOffer(text);
                  setAnswer('');
                }}
              />
              <Field label="Paste the GM's offer">
                <textarea
                  rows={4}
                  value={incomingOffer}
                  onChange={(e) => {
                    setIncomingOffer(e.target.value);
                    setAnswer('');
                  }}
                  placeholder="The GM's connection offer…"
                />
              </Field>
              <button
                className="button-primary"
                disabled={busy || !incomingOffer.trim()}
                onClick={() =>
                  void run(async () => {
                    const parsed = decodeConnectionInput(incomingOffer, 'offer');
                    setAnswer('');
                    setAnswer(await client().acceptOffer(parsed.text));
                  })
                }
              >
                Create connection answer
              </button>
              {answer && (
                <>
                  <ConnectionQrDisplay text={answer} kind="answer" />
                  <details className="connection-text-fallback">
                    <summary>Copy/paste response</summary>
                    <Field label="Send this answer back to the GM">
                      <textarea readOnly rows={4} value={answer} onFocus={(e) => e.target.select()} />
                    </Field>
                    <button onClick={() => copy(answer)}>
                      <Copy size={16} /> Copy answer
                    </button>
                  </details>
                </>
              )}
            </>
          )}
          <p className="muted">
            The GM approves your first connection. When the GM is offline, cached material stays readable and
            your drafts remain local.
          </p>
          {props.clientRef.current && (
            <button
              onClick={() => {
                props.clientRef.current?.clearPairing();
                props.notify('Saved pairing cleared. The GM must approve the next connection.');
              }}
            >
              Clear saved pairing
            </button>
          )}
        </div>
      )}
      {tab === 'drafts' && (
        <div className="stack">
          <p>
            Prepare narrative changes while offline. Drafts stay separate from the shared character until the
            GM reviews them.
          </p>
          <Field label="Character">
            <select value={selectedCharacter} onChange={(e) => setSelectedCharacter(e.target.value)}>
              <option value="">Choose a character…</option>
              {availableCharacters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            disabled={!selectedCharacter || !props.campaign}
            onClick={() => {
              const character = props.campaign!.characters.find((c) => c.id === selectedCharacter);
              if (character) setDraft(makeDraft(props.campaign!.id, character));
            }}
          >
            Start local draft
          </button>
          {drafts.map((d) => (
            <div className="actions" key={d.id}>
              <span>
                {d.proposed.name} · revision {d.baseRevision}
              </span>
              <button onClick={() => setDraft(structuredClone(d))}>Open draft</button>
              <button
                onClick={() => {
                  deleteDraft(d.id);
                  refreshDrafts();
                  if (draft?.id === d.id) setDraft(undefined);
                }}
              >
                Delete draft
              </button>
            </div>
          ))}
          {draft && (
            <section className="card" style={{ padding: 16 }}>
              <h3>{draft.proposed.name}</h3>
              {(['description', 'notes', 'extras'] as const).map((field) => (
                <Field key={field} label={field[0].toUpperCase() + field.slice(1)}>
                  <textarea
                    rows={4}
                    value={draft.proposed[field]}
                    onChange={(e) =>
                      setDraft({ ...draft, proposed: { ...draft.proposed, [field]: e.target.value } })
                    }
                  />
                </Field>
              ))}
              {props.campaign?.characters.find((c) => c.id === draft.characterId) &&
                compareDraft(
                  draft,
                  props.campaign.characters.find((c) => c.id === draft.characterId)!,
                ).stale && (
                  <p className="notice">
                    The shared character changed after this draft began. Review the latest sheet and start a
                    fresh draft before submitting.
                  </p>
                )}
              <div className="actions">
                <button
                  className="button-primary"
                  onClick={() => {
                    try {
                      saveDraft(draft);
                      refreshDrafts();
                      props.notify('Draft saved on this device.');
                    } catch {
                      failure('Could not save the draft. Export it before closing.');
                    }
                  }}
                >
                  Save local draft
                </button>
                <button
                  onClick={() =>
                    downloadFile(
                      JSON.stringify(draft, null, 2),
                      `${draft.proposed.name.replace(/[^a-z0-9]/gi, '-')}-draft.json`,
                    )
                  }
                >
                  Export draft
                </button>
                <button
                  disabled={!props.clientRef.current?.connected || busy}
                  onClick={() =>
                    void run(async () => {
                      const changes = Object.fromEntries(
                        (['description', 'notes', 'extras'] as const)
                          .filter((field) => draft.proposed[field] !== draft.base[field])
                          .map((field) => [field, draft.proposed[field]]),
                      );
                      if (!Object.keys(changes).length) throw new Error('This draft has no changes yet.');
                      saveDraft(draft);
                      refreshDrafts();
                      await props.clientRef.current!.proposeDraft({
                        id: crypto.randomUUID(),
                        characterId: draft.characterId,
                        baseRevision: draft.baseRevision,
                        changes,
                      });
                      props.notify('Draft sent to the GM for review.');
                    })
                  }
                >
                  Submit for GM review
                </button>
              </div>
            </section>
          )}
        </div>
      )}
      <div className="modal-actions" style={{ marginTop: 24 }}>
        <button onClick={stop}>
          <Unplug size={16} /> Disconnect table
        </button>
        <button className="button-primary" onClick={props.close}>
          Done
        </button>
      </div>
    </Modal>
  );
}

export default ConnectionPanel;
