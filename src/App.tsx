import { useCallback, useEffect, useRef, useState } from 'react';
import Dexie, { type Table } from 'dexie';
import {
  Archive,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  Compass,
  Copy,
  Download,
  FolderOpen,
  Home,
  Map,
  Menu,
  Package,
  Plus,
  Printer,
  Radio,
  Settings2,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { Actor, Campaign, CampaignExport } from './domain/types';
import { SystemBadge } from './components/SystemBadge';
import { type FateSystem } from './domain/editions';
import { createCampaign, id } from './domain/defaults';
import { applyCommand, type GameCommand } from './domain/commands';
import { listCampaigns, loadCampaign, saveCampaign, deleteCampaign } from './storage/db';
import {
  cloneCampaign,
  exportCampaign,
  exportCampaignZip,
  importCampaign,
  parseCampaignExport,
} from './storage/backup';
import { FatePeerHost, FatePeerClient, clearHostGrants } from './network';
import { initialRoomAddress } from './network/rooms';
import { DEFAULT_CONNECTION_SETTINGS, type ConnectionSettings } from './network/connection-settings';
import { Overview } from './components/Overview';
import { Characters } from './components/Characters';
import { RulesSettings } from './components/RulesSettings';
import { World, Inventory } from './components/World';
import { ReferenceLibrary } from './components/ReferenceLibrary';
import { SessionTable } from './components/SessionTable';
import { Maps } from './components/Maps';
import { ConnectionPanel } from './components/ConnectionPanel';
import { PrintSheets } from './components/PrintSheets';
import { AppVersion } from './components/AppVersion';
import { RulesAttribution, logoCredit, fontCredit } from './components/RulesAttribution';
import { campaignBanner } from './campaign-banner';
import { lastPlayedAt, relativePlayDate } from './domain/campaign-activity';
import {
  Badge,
  ConfirmButton,
  Empty,
  Field,
  Modal,
  PageTitle,
  downloadFile,
  slug,
  type EditorProps,
} from './ui';
import { sampleCampaign } from './sample';
import { heartsOfSteelCampaign } from './hearts-of-steel';
import { cirrusSkimmerCampaign } from './cirrus-skimmer';

type PlayerSnapshot = { id: string; campaign: Campaign; actor?: Actor };
const cacheDb = new Dexie('fate-player-cache') as Dexie & {
  snapshots: Table<PlayerSnapshot, string>;
};
cacheDb.version(1).stores({ snapshots: 'id' });
const navigation = [
  ['overview', 'Overview', Home],
  ['characters', 'Characters', Users],
  ['session', 'At the table', Sparkles],
  ['journal', 'Campaign journal', BookOpen],
  ['inventory', 'Inventory', Package],
  ['maps', 'Maps & zones', Map],
  ['reference', 'Rules library', Compass],
  ['print', 'Print sheets', Printer],
  ['rules', 'Game settings', Settings2],
] as const;
export default function App() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [page, setPage] = useState('overview');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean }>();
  const [creating, setCreating] = useState(false);
  const [loadingSample, setLoadingSample] = useState<'lantern' | 'hearts' | 'cirrus' | null>(null);
  const [createName, setCreateName] = useState('');
  const [createSystem, setCreateSystem] = useState<FateSystem>('fate-core');
  const [createKind, setCreateKind] = useState<'campaign' | 'one-shot'>('campaign');
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState(false);
  const [connection, setConnection] = useState(() => !!initialRoomAddress());
  const [attribution, setAttribution] = useState(false);
  const [backup, setBackup] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ data: Uint8Array; parsed: CampaignExport }>();
  const [importMode, setImportMode] = useState<'copy' | 'restore'>('copy');
  const [remote, setRemote] = useState<Campaign>();
  const [playerCopies, setPlayerCopies] = useState<PlayerSnapshot[]>([]);
  const reloadPlayerCopies = useCallback(async () => {
    const records = await cacheDb.snapshots.toArray();
    const copies = new globalThis.Map<string, PlayerSnapshot>();
    for (const record of records) {
      const previous = copies.get(record.campaign.id);
      if (!previous || record.campaign.revision >= previous.campaign.revision)
        copies.set(record.campaign.id, record);
    }
    setPlayerCopies([...copies.values()]);
  }, []);
  const [remoteActor, setRemoteActor] = useState<Actor>();
  const [remoteStatus, setRemoteStatus] = useState('');
  const hostRef = useRef<FatePeerHost | null>(null);
  const clientRef = useRef<FatePeerClient | null>(null);
  const connectionSettingsRef = useRef<ConnectionSettings>({ ...DEFAULT_CONNECTION_SETTINGS });
  const queue = useRef(Promise.resolve());
  const campaign = remote || campaigns.find((c) => c.id === selectedId);
  const campaignRef = useRef(campaign);
  campaignRef.current = campaign;
  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      notify(`Offline setup: ${error.message}`, true);
    },
  });
  const reload = useCallback(async () => {
    setCampaigns(await listCampaigns());
  }, []);
  useEffect(() => {
    void reloadPlayerCopies().catch(() => notify('Saved player campaigns could not be opened.', true));
    void reload()
      .then(() => {
        const id = localStorage.getItem('fate-selected');
        if (id) setSelectedId(id);
      })
      .catch((e) => notify(e.message, true))
      .finally(() => setLoaded(true));
  }, [reload, reloadPlayerCopies, notify]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), toast.error ? 12000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(
    () => () => {
      hostRef.current?.close();
      clientRef.current?.close();
    },
    [],
  );
  const stopConnections = () => {
    hostRef.current?.close();
    hostRef.current = null;
    clientRef.current?.close();
    clientRef.current = null;
    setRemoteStatus('');
  };
  const select = (c: Campaign) => {
    stopConnections();
    campaignRef.current = c;
    setSelectedId(c.id);
    localStorage.setItem('fate-selected', c.id);
    setPage('overview');
    setMenu(false);
    setRemote(undefined);
  };
  const queueMutation = useCallback((mutate: (c: Campaign) => Campaign): Promise<Campaign> => {
    const targetId = campaignRef.current?.id;
    if (!targetId) return Promise.reject(new Error('Open a local campaign first.'));
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        setSaving(true);
        try {
          const original = await loadCampaign(targetId);
          if (!original) throw new Error('The campaign could not be found on this device.');
          const next = mutate(original);
          if (next !== original) await saveCampaign(next, original.revision);
          setCampaigns((all) => all.map((c) => (c.id === next.id ? next : c)));
          if (campaignRef.current?.id === targetId) {
            campaignRef.current = next;
            void hostRef.current?.broadcast();
          }
          return next;
        } finally {
          setSaving(false);
        }
      });
    queue.current = task.then(
      () => {},
      () => {},
    );
    return task;
  }, []);
  const update: EditorProps['update'] = useCallback(
    async (change) => {
      if (clientRef.current || campaignRef.current?.id === remote?.id) {
        notify('Shared campaign edits require the GM. Prepare a character draft from Connect.', true);
        return false;
      }
      try {
        await queueMutation((c) => {
          const d = structuredClone(c);
          change(d);
          d.revision++;
          d.updatedAt = new Date().toISOString();
          return d;
        });
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e), true);
        return false;
      }
    },
    [queueMutation, notify, remote?.id],
  );
  const applyNetworkCommand = useCallback(
    async (command: unknown, actor: Actor) =>
      queueMutation((c) => applyCommand(c, command as GameCommand, actor)),
    [queueMutation],
  );
  const dispatch: EditorProps['dispatch'] = useCallback(
    async (input) => {
      try {
        const command = { ...input, id: id() } as GameCommand;
        if (clientRef.current) {
          if (!clientRef.current.connected)
            throw new Error(
              'The GM is offline. Shared play is paused; your cached campaign remains available.',
            );
          await clientRef.current.sendCommand(command);
        } else if (remote) {
          throw new Error('This is a cached player copy. Reconnect to the GM to play.');
        } else
          await applyNetworkCommand(command, {
            id: campaignRef.current?.members.find((m) => m.role === 'gm')?.id || 'gm',
            role: 'gm',
            characterIds: [],
          });
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e), true);
        return false;
      }
    },
    [applyNetworkCommand, notify, remote],
  );
  const add = async (c: Campaign) => {
    try {
      await saveCampaign(c, -1);
      await reload();
      select(c);
      setCreating(false);
      setCreateName('');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  };
  const exploreSample = async (sample: 'lantern' | 'hearts' | 'cirrus') => {
    if (loadingSample) return;
    setLoadingSample(sample);
    try {
      await add(
        sample === 'cirrus'
          ? cirrusSkimmerCampaign()
          : sample === 'hearts'
            ? await heartsOfSteelCampaign()
            : await sampleCampaign(),
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The example campaign could not be loaded.', true);
    } finally {
      setLoadingSample(null);
    }
  };
  const onRemoteCampaign = useCallback(
    (c: Campaign, actor?: Actor) => {
      setRemote(c);
      if (actor) setRemoteActor(actor);
      setPage((p) => (p === 'rules' ? 'overview' : p));
      void cacheDb.snapshots
        .put({ id: c.id, campaign: c, actor: actor || clientRef.current?.actor })
        .then(reloadPlayerCopies)
        .catch(() => notify('Player cache could not be saved. Keep a player export.', true));
    },
    [notify, reloadPlayerCopies],
  );
  const disconnect = () => {
    clientRef.current?.close();
    clientRef.current = null;
    setRemote(undefined);
    setRemoteActor(undefined);
    setRemoteStatus('');
    setSelectedId(undefined);
    localStorage.removeItem('fate-selected');
  };
  const openPlayerCopy = (cached: PlayerSnapshot) => {
    stopConnections();
    setRemote(cached.campaign);
    setRemoteActor(cached.actor);
    setPage('overview');
    setRemoteStatus('Offline');
  };
  const restoreImport = async (data: Uint8Array, mode: 'copy' | 'restore', campaignId: string) => {
    stopConnections();
    if (mode === 'restore') clearHostGrants(campaignId);
    await queue.current.catch(() => {});
    return importCampaign(data, mode);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error('Backups must be no larger than 64 MB.');
      const data = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseCampaignExport(data);
      setImportMode('copy');
      setPendingImport({ data, parsed });
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  };
  const backupFile = async (zip = false, player = false) => {
    if (!campaign) return;
    try {
      const audience = remote || player ? 'player' : 'gm';
      const content = zip
        ? await exportCampaignZip(campaign, audience, remoteActor)
        : await exportCampaign(campaign, audience, remoteActor);
      downloadFile(
        content,
        `${slug(campaign.name)}-${audience}.${zip ? 'zip' : 'json'}`,
        zip ? 'application/zip' : 'application/json',
      );
      notify('Backup downloaded. Keep it somewhere outside browser storage.');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  };
  const props = campaign
    ? {
        campaign,
        update,
        dispatch,
        notify,
        readOnly: !!remote,
        playDisabled: !!remote && !clientRef.current?.connected,
        playerActor: remote ? remoteActor : undefined,
      }
    : undefined;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <button
          className="brand"
          onClick={() => {
            stopConnections();
            if (remote) disconnect();
            campaignRef.current = undefined;
            setSelectedId(undefined);
            setMenu(false);
          }}
        >
          <img src={`${import.meta.env.BASE_URL}branding/powered-by-fate-dark.svg`} alt="Powered by Fate" />
          <span>CAMPAIGN COMPANION</span>
        </button>
        <button
          className="library-link"
          onClick={() => {
            stopConnections();
            if (remote) disconnect();
            campaignRef.current = undefined;
            setSelectedId(undefined);
            setMenu(false);
          }}
        >
          <FolderOpen size={17} />
          My campaigns
        </button>
        {campaign ? (
          <>
            <div className="sidebar-campaign">
              <span className="eyebrow">{remote ? 'PLAYER VIEW' : 'CURRENT CAMPAIGN'}</span>
              <strong>{campaign.name}</strong>
            </div>
            <nav aria-label="Campaign">
              {navigation
                .filter(([key]) => !remote || key !== 'rules')
                .map(([key, label, Icon]) => (
                  <button
                    key={key}
                    className={page === key ? 'active' : ''}
                    onClick={() => {
                      setPage(key);
                      setMenu(false);
                    }}
                  >
                    <Icon size={18} />
                    {label}
                    {page === key && <span className="nav-dot" />}
                  </button>
                ))}
            </nav>
          </>
        ) : (
          <div className="sidebar-empty">
            <Compass size={32} />
            <p>
              Your next adventure
              <br />
              starts here.
            </p>
            <span>Create a campaign to bring your world to life.</span>
          </div>
        )}
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="status-dot" />
            <span>
              Your stories stay yours.<small>Saved on this device</small>
            </span>
          </div>
          <button onClick={() => setConnection(true)}>
            <Radio size={17} />
            {remote ? 'Connection & drafts' : 'Connect to a table'}
          </button>
          <a href="https://fate-srd.com/" target="_blank" rel="noreferrer">
            <CircleHelp size={16} />
            About Fate
            <ArrowRight size={14} />
          </a>
          <div className="sidebar-attribution">
            <button onClick={() => setAttribution(true)} aria-haspopup="dialog">
              Rules Attribution
              <ArrowRight size={14} />
            </button>
            <p>{logoCredit}</p>
            <p>{fontCredit}</p>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            {campaign && (
              <>
                <span>My campaigns</span>
                <span>/</span>
                <strong>{navigation.find(([key]) => key === page)?.[1] || 'Overview'}</strong>
                <SystemBadge rules={campaign.rules} />
              </>
            )}
          </div>
          <div className="topbar-actions">
            {saving && (
              <span className="save-label" role="status">
                <span className="status-dot amber" />
                Saving…
              </span>
            )}
            {campaign && (
              <>
                <button className="button-small" onClick={() => setBackup(true)}>
                  <Download size={15} />
                  <span>Backup</span>
                </button>
                <button className="button-primary button-small" onClick={() => setConnection(true)}>
                  <Radio size={15} />
                  <span>
                    {remote ? remoteStatus || 'Player view' : hostRef.current ? 'Hosting' : 'Connect'}
                  </span>
                </button>
              </>
            )}
          </div>
        </header>
        {remote && !clientRef.current?.connected && (
          <div className="remote-banner" role="status">
            <Radio size={15} />
            <span>
              {remoteStatus === 'reconnecting'
                ? 'Reconnecting to the table · your saved approval is retained'
                : 'Read-only player copy · reconnect to the GM to play'}
            </span>
          </div>
        )}
        {needRefresh && (
          <div className="update-banner">
            <span>An application update is ready. Apply it between sessions after making a backup.</span>
            <button
              disabled={!!hostRef.current || !!clientRef.current}
              onClick={() => void updateServiceWorker(true)}
            >
              Update application
            </button>
          </div>
        )}
        <main>
          {!loaded ? (
            <div className="loading-state">Opening your stories…</div>
          ) : !campaign ? (
            <>
              <PageTitle
                eyebrow="YOUR STORIES. YOUR TABLE."
                title="A little fate. A lot of possibility."
                text="Build a world, gather your characters, and make something worth remembering."
                actions={
                  <label className="button">
                    <Upload size={16} />
                    Import backup
                    <input
                      hidden
                      type="file"
                      accept=".json,.zip"
                      onChange={(e) => {
                        void importFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                }
              />
              <section className="welcome-banner">
                <div>
                  <Badge tone="brand-tone">FATE · FICTION FIRST</Badge>
                  <h2>
                    The next great story
                    <br />
                    is waiting for you.
                  </h2>
                  <p>
                    From the first high concept to the last impossible roll.
                    <br />A home for your entire campaign, right in your browser.
                  </p>
                  <button
                    className="button-accent"
                    onClick={() => {
                      setCreateSystem('fate-core');
                      setCreating(true);
                    }}
                  >
                    <Plus size={17} />
                    Create a campaign
                  </button>
                </div>
                <div className="dice-art" aria-hidden="true">
                  <img
                    className="welcome-dice-image"
                    src={`${import.meta.env.BASE_URL}illustrations/welcome-fate-dice.png`}
                    alt=""
                  />
                  <div className="orbit orbit-1" />
                  <div className="orbit orbit-2" />
                  <span className="art-star star-a">✦</span>
                  <span className="art-star star-b">✧</span>
                  <span className="art-label">LET THE STORY UNFOLD</span>
                </div>
              </section>
              <div className="section-heading campaign-list-heading">
                <div>
                  <h2>Your campaigns</h2>
                  <p className="muted">Pick up a story, or start a new one.</p>
                </div>
                <div className="actions">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(e) => setShowArchived(e.target.checked)}
                    />
                    Show archived
                  </label>
                </div>
              </div>
              <div className="campaign-grid">
                {campaigns
                  .filter((c) => showArchived || !c.archived)
                  .map((c, i) => {
                    const banner = campaignBanner(c);
                    const lastPlayed = lastPlayedAt(c);
                    return (
                      <article className={`campaign-card campaign-color-${i % 3}`} key={c.id}>
                        <button className="campaign-card-open" onClick={() => select(c)}>
                          <div className="campaign-card-art">
                            {banner ? (
                              <img
                                src={banner.src}
                                alt=""
                                style={{ objectPosition: `center ${banner.position}%` }}
                              />
                            ) : (
                              <Compass size={70} strokeWidth={0.7} />
                            )}
                            <Badge>
                              {c.archived ? 'Archived' : c.kind === 'one-shot' ? 'One-shot' : 'Campaign'}
                            </Badge>
                          </div>
                          <div className="campaign-card-body">
                            <h3>{c.name}</h3>
                            <SystemBadge rules={c.rules} />
                            <p>{c.tagline || c.setting || 'A world waiting to be discovered.'}</p>
                            <div className="character-meta">
                              <span>
                                <Users size={14} />
                                {c.characters.filter((ch) => ch.kind === 'pc').length} characters
                              </span>
                              <span>
                                {new Date(c.updatedAt).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          </div>
                        </button>
                        <div className="campaign-card-tools">
                          <span className="campaign-last-played">
                            {lastPlayed ? (
                              <>
                                Last played{' '}
                                <time dateTime={lastPlayed} title={new Date(lastPlayed).toLocaleString()}>
                                  {relativePlayDate(lastPlayed)}
                                </time>
                              </>
                            ) : (
                              'Not played yet'
                            )}
                          </span>
                          <button
                            title="Duplicate campaign"
                            aria-label={`Duplicate ${c.name}`}
                            onClick={() => void add(cloneCampaign(c))}
                          >
                            <Copy size={15} />
                          </button>
                          <button
                            title={c.archived ? 'Unarchive' : 'Archive'}
                            aria-label={`${c.archived ? 'Unarchive' : 'Archive'} ${c.name}`}
                            onClick={() =>
                              void saveCampaign(
                                { ...c, archived: !c.archived, revision: c.revision + 1 },
                                c.revision,
                              )
                                .then(reload)
                                .catch((e) => notify(e.message, true))
                            }
                          >
                            <Archive size={15} />
                          </button>
                          <ConfirmButton
                            title={`Delete ${c.name}?`}
                            tooltip="Delete"
                            message="Permanently delete this campaign and its saved data from this browser? This cannot be undone. Export a backup first if you may want to restore it."
                            onConfirm={() =>
                              void queue.current
                                .then(() => deleteCampaign(c.id))
                                .then(reload)
                                .catch((e) => notify(e.message, true))
                            }
                          />
                        </div>
                      </article>
                    );
                  })}
                <button
                  className="new-campaign-card"
                  onClick={() => {
                    setCreateSystem('fate-core');
                    setCreating(true);
                  }}
                >
                  <span>
                    <Plus size={26} />
                  </span>
                  <strong>A new beginning</strong>
                  <p>Give your next story a home.</p>
                </button>
              </div>
              <div className="starter-row">
                <span>
                  <Sparkles size={18} />
                  Try an example campaign
                </span>
                <button
                  className="button-text"
                  disabled={!!loadingSample}
                  onClick={() => void exploreSample('lantern')}
                >
                  {loadingSample === 'lantern' ? 'Loading The Lantern Coast…' : 'Explore The Lantern Coast'}{' '}
                  <ArrowRight size={16} />
                </button>
                <button
                  className="button-text"
                  disabled={!!loadingSample}
                  onClick={() => void exploreSample('hearts')}
                >
                  {loadingSample === 'hearts' ? 'Loading Hearts of Steel…' : 'Explore Hearts of Steel'}{' '}
                  <ArrowRight size={16} />
                </button>
                <button
                  className="button-text"
                  disabled={!!loadingSample}
                  onClick={() => void exploreSample('cirrus')}
                >
                  {loadingSample === 'cirrus'
                    ? 'Loading Cirrus Skimmer…'
                    : 'Explore Cirrus Skimmer (Accelerated)'}{' '}
                  <ArrowRight size={16} />
                </button>
              </div>
              {playerCopies.length > 0 && (
                <section className="joined-campaigns">
                  <h2>Joined campaigns</h2>
                  <p className="muted">Saved player copies are read-only until you reconnect to their GM.</p>
                  <div className="campaign-grid">
                    {playerCopies.map((copy) => (
                      <article className="card" key={copy.campaign.id} style={{ padding: 20 }}>
                        <Badge>Read-only player copy</Badge>
                        <h3>{copy.campaign.name}</h3>
                        <SystemBadge rules={copy.campaign.rules} />
                        <p>
                          {copy.campaign.characters
                            .filter((ch) => copy.actor?.characterIds.includes(ch.id))
                            .map((ch) => ch.name)
                            .join(', ') || 'No character assigned'}
                        </p>
                        <button
                          onClick={() => openPlayerCopy(copy)}
                          aria-label={`Open joined campaign ${copy.campaign.name}`}
                        >
                          Open campaign
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <div className="workspace-footer">
                <span>
                  <ShieldIcon />
                  No account required. Works offline. Connect if desired.
                </span>
              </div>
            </>
          ) : props ? (
            <>
              {page === 'overview' && <Overview {...props} navigate={setPage} />}{' '}
              {page === 'characters' && (
                <Characters key={`${campaign.id}:${remoteActor?.id || 'gm'}`} {...props} />
              )}{' '}
              {page === 'rules' && <RulesSettings key={campaign.id} {...props} />}{' '}
              {page === 'journal' && <World {...props} />} {page === 'inventory' && <Inventory {...props} />}{' '}
              {page === 'reference' && <ReferenceLibrary {...props} />}{' '}
              {page === 'print' && (
                <PrintSheets
                  key={campaign.id}
                  campaign={campaign}
                  readOnly={!!remote}
                  playerActor={remote ? remoteActor : undefined}
                />
              )}{' '}
              {page === 'session' && (
                <SessionTable key={`${campaign.id}:${remoteActor?.id || 'gm'}`} {...props} />
              )}{' '}
              {page === 'maps' && <Maps {...props} />}
            </>
          ) : null}
        </main>
        <footer className="app-footer">
          <AppVersion />
          <span>Tools by Nick Oddson to support games using the world's best TTRPG, Fate</span>
        </footer>
      </div>
      {toast && (
        <div role={toast.error ? 'alert' : 'status'} className={`toast ${toast.error ? 'error' : ''}`}>
          <span>{toast.text}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast(undefined)}>
            <X size={16} />
          </button>
        </div>
      )}
      {attribution && <RulesAttribution close={() => setAttribution(false)} />}
      {creating && (
        <Modal title="Give your story a name" close={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const c = createCampaign(createName.trim(), createSystem);
              c.kind = createKind;
              void add(c);
            }}
          >
            <Field label="Campaign name">
              <input
                autoFocus
                required
                placeholder="The Lantern Coast"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </Field>
            <Field label="Rules system">
              <select value={createSystem} onChange={(e) => setCreateSystem(e.target.value as FateSystem)}>
                <option value="fate-core">Fate Core</option>
                <option value="fate-accelerated">Fate Accelerated</option>
              </select>
            </Field>
            <p className="rules-choice-summary" aria-live="polite">
              <strong>{createSystem === 'fate-core' ? 'Fate Core' : 'Fate Accelerated'}</strong>
              {createSystem === 'fate-core'
                ? ' uses skills, a skill pyramid, and separate physical and mental stress tracks.'
                : ' uses six approaches, a shorter character creation process, and one shared stress track.'}{' '}
              This campaign uses one rules system for everyone at the table.
            </p>
            <Field label="Format">
              <select value={createKind} onChange={(e) => setCreateKind(e.target.value as typeof createKind)}>
                <option value="campaign">Ongoing campaign</option>
                <option value="one-shot">One-shot</option>
              </select>
            </Field>
            <p className="muted">
              Start with the selected rules system. You can customize its settings inside the campaign.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="button-primary">
                Create campaign
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {backup && campaign && (
        <Modal title="Keep your story safe" close={() => setBackup(false)}>
          <p>
            Download a complete, portable copy with your rules, characters, history, and images. Browser
            storage is useful, but an external backup is yours to keep.
          </p>
          <div className="backup-options">
            <button onClick={() => void backupFile()}>
              <Download />
              <span>
                <strong>{remote ? 'Player' : 'Full campaign'} JSON</strong>
                <small>One self-contained file, including images</small>
              </span>
            </button>
            <button onClick={() => void backupFile(true)}>
              <Package />
              <span>
                <strong>Compact ZIP backup</strong>
                <small>The same campaign, with separate image files</small>
              </span>
            </button>
            {!remote && (
              <button onClick={() => void backupFile(false, true)}>
                <Users />
                <span>
                  <strong>Player-safe JSON</strong>
                  <small>Shared content only; GM secrets excluded</small>
                </span>
              </button>
            )}
            <label className="button">
              <Upload size={17} />
              Import / restore backup
              <input
                hidden
                type="file"
                accept=".json,.zip"
                onChange={(e) => {
                  void importFile(e.target.files?.[0]);
                  setBackup(false);
                }}
              />
            </label>
          </div>
        </Modal>
      )}
      {pendingImport && (
        <Modal title="Review your import" close={() => setPendingImport(undefined)}>
          <h3>{pendingImport.parsed.campaign.name}</h3>
          <p>
            {pendingImport.parsed.campaign.characters.length} characters ·{' '}
            {pendingImport.parsed.campaign.assets.length} images ·{' '}
            {pendingImport.parsed.campaign.events.length} events
          </p>
          <Badge>{pendingImport.parsed.audience === 'gm' ? 'GM backup' : 'Player reference copy'}</Badge>
          <Field label="Import as">
            <select value={importMode} onChange={(e) => setImportMode(e.target.value as typeof importMode)}>
              <option value="copy">Independent copy (recommended)</option>
              {pendingImport.parsed.audience === 'gm' && (
                <option value="restore">Restore original campaign identity</option>
              )}
            </select>
          </Field>
          {importMode === 'restore' && (
            <p className="notice-text">
              Restoring replaces a matching local campaign. Peer devices must pair again. Close the old host
              before starting a new session.
            </p>
          )}
          <div className="modal-actions">
            <button onClick={() => setPendingImport(undefined)}>Cancel</button>
            <button
              className="button-primary"
              onClick={() =>
                void restoreImport(pendingImport.data, importMode, pendingImport.parsed.campaign.id)
                  .then(async (c) => {
                    if (importMode === 'restore') {
                      stopConnections();
                      clearHostGrants(c.id);
                    }
                    await reload();
                    select(c);
                    setPendingImport(undefined);
                    notify('Campaign imported successfully.');
                  })
                  .catch((e) => notify(e.message, true))
              }
            >
              Import campaign
            </button>
          </div>
        </Modal>
      )}
      {connection && (
        <ConnectionPanel
          playerActor={remoteActor}
          isPlayerView={!!remote}
          campaign={campaign}
          getCampaign={() => campaignRef.current}
          hostRef={hostRef}
          clientRef={clientRef}
          settingsRef={connectionSettingsRef}
          onRemoteCampaign={onRemoteCampaign}
          onDisconnect={disconnect}
          onCommand={applyNetworkCommand}
          onConnectionStatus={setRemoteStatus}
          notify={notify}
          close={() => setConnection(false)}
        />
      )}
    </div>
  );
}
function ShieldIcon() {
  return <Check size={15} />;
}
