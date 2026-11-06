import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Feather,
  Plus,
  Printer,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { createCharacter, id } from '../domain/defaults';
import { releaseCharacterInventory } from '../domain/inventory';
import { applyMilestoneChoice, deriveCharacter, supportedColumns, validateCharacter } from '../domain/rules';
import type { MilestoneChoice } from '../domain/rules';
import { coreRuleSource } from '../domain/rule-sources';
import type { Character, Consequence, Milestone, Stunt } from '../domain/types';
import { createAsset } from '../storage/assets';
import { campaignForPrint, PrintDialog } from './PrintSheets';
import { CharacterSheet } from './print/CharacterSheet';
import { PrintFolio } from './print/PrintFolio';
import { exportCharacter, parseCharacterExport } from '../storage/backup';
import type { CharacterExport } from '../storage/backup';
import { prepareCharacterImport, ruleDifferences } from '../domain/character-import';
import { compareDraft, deleteDraft, listDrafts, makeDraft, saveDraft } from '../network/drafts';
import type { CharacterDraft } from '../network/drafts';
import {
  AddButton,
  Badge,
  ConfirmButton,
  Empty,
  Field,
  Modal,
  PageTitle,
  downloadFile,
  initials,
  signed,
  slug,
  type EditorProps,
} from '../ui';

const emptyStunt = (): Stunt => ({
  id: id(),
  name: '',
  description: '',
  refreshCost: 1,
  fateCost: 0,
  limit: 'none',
  uses: 0,
  maxUses: 1,
});

export function Characters(props: EditorProps) {
  const { campaign: c, update, notify, readOnly } = props;
  const [selected, setSelected] = useState<string>();
  const [filter, setFilter] = useState<'pc' | 'npc'>('pc');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Character['kind']>('pc');
  const [mode, setMode] = useState<Character['creationMode']>('full');
  const [pendingImport, setPendingImport] = useState<CharacterExport>();
  const character = c.characters.find((ch) => ch.id === selected);
  const importIssues = pendingImport ? validateCharacter(pendingImport.character, c.rules) : [];
  const differences = pendingImport ? ruleDifferences(pendingImport.rules, c.rules) : [];
  if (character)
    return (
      <CharacterEditor
        key={character.id}
        {...props}
        character={character}
        back={() => setSelected(undefined)}
      />
    );
  return (
    <>
      <PageTitle
        eyebrow="The cast"
        title="Extraordinary people"
        text="Their strengths, their complications, and the stories between them."
        actions={
          !readOnly && (
            <>
              <label className="button">
                Import character
                <input
                  hidden
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file)
                      void (async () => {
                        if (file.size > 32 * 1024 * 1024)
                          throw new Error('Character files must be no larger than 32 MB.');
                        setPendingImport(await parseCharacterExport(await file.text()));
                      })().catch((error) => notify(error.message, true));
                  }}
                />
              </label>
              <AddButton
                onClick={() => {
                  setKind(filter === 'pc' ? 'pc' : 'supporting');
                  setCreating(true);
                }}
              >
                New character
              </AddButton>
            </>
          )
        }
      />
      <div className="tabs">
        <button className={filter === 'pc' ? 'active' : ''} onClick={() => setFilter('pc')}>
          Protagonists <span>{c.characters.filter((ch) => ch.kind === 'pc').length}</span>
        </button>
        <button className={filter === 'npc' ? 'active' : ''} onClick={() => setFilter('npc')}>
          NPCs & adversaries <span>{c.characters.filter((ch) => ch.kind !== 'pc').length}</span>
        </button>
      </div>
      <div className="character-grid">
        {c.characters
          .filter((ch) => (filter === 'pc' ? ch.kind === 'pc' : ch.kind !== 'pc'))
          .map((ch, index) => {
            const stats = deriveCharacter(ch, c.rules),
              portrait = c.assets.find((a) => a.id === ch.portraitAssetId);
            return (
              <button className="character-card" key={ch.id} onClick={() => setSelected(ch.id)}>
                <div className={`character-cover color-${index % 4}`}>
                  <div className="cover-symbol" aria-hidden="true">
                    {['✦', '◇', '☾', '✧'][index % 4]}
                  </div>
                  <Badge>
                    {ch.kind === 'pc' ? (ch.status === 'ready' ? 'Ready to play' : 'In progress') : ch.kind}
                  </Badge>
                  <div className="avatar">
                    {portrait ? <img src={portrait.dataUrl} alt="" /> : initials(ch.name)}
                  </div>
                </div>
                <div className="character-card-body">
                  <h2>{ch.name}</h2>
                  <p>
                    {ch.aspects.find((a) => a.kind === 'highConcept')?.name || 'A story waiting to happen'}
                  </p>
                  <div className="character-meta">
                    <span>
                      <Sparkles size={15} />
                      {ch.fatePoints} Fate points
                    </span>
                    <span>{stats.refresh} refresh</span>
                  </div>
                </div>
              </button>
            );
          })}
      </div>
      {!c.characters.some((ch) => (filter === 'pc' ? ch.kind === 'pc' : ch.kind !== 'pc')) && (
        <Empty
          icon={<Users size={30} />}
          title={filter === 'pc' ? 'Who will answer the call?' : 'A world full of characters'}
          text={
            filter === 'pc'
              ? 'Start with a name and a high concept. Discover the rest together.'
              : 'Create allies, adversaries, and the people caught in between.'
          }
          action={
            !readOnly && (
              <AddButton
                onClick={() => {
                  setKind(filter === 'pc' ? 'pc' : 'supporting');
                  setCreating(true);
                }}
              >
                Create a character
              </AddButton>
            )
          }
        />
      )}
      {creating && (
        <Modal title="A new character" close={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                const ch = createCharacter(c.rules, name.trim(), kind);
                ch.creationMode = mode;
                ch.ownerId = c.members.find((m) => m.role === 'gm')?.id || 'gm';
                if (
                  await update((d) => {
                    d.characters.push(ch);
                  })
                ) {
                  setCreating(false);
                  setName('');
                  setSelected(ch.id);
                }
              })();
            }}
          >
            <Field label="Name">
              <input
                autoFocus
                required
                placeholder="What are they called?"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Role">
              <select value={kind} onChange={(e) => setKind(e.target.value as Character['kind'])}>
                <option value="pc">Player character</option>
                <option value="nameless">Nameless NPC</option>
                <option value="supporting">Supporting NPC</option>
                <option value="main">Main NPC</option>
              </select>
            </Field>
            <Field label="Creation approach">
              <select value={mode} onChange={(e) => setMode(e.target.value as Character['creationMode'])}>
                <option value="full">Full creation — build the whole story</option>
                <option value="quick">Quick creation — discover as you play</option>
              </select>
            </Field>
            <div className="modal-actions">
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="button-primary">Create character</button>
            </div>
          </form>
        </Modal>
      )}
      {pendingImport && (
        <Modal title="Review character import" close={() => setPendingImport(undefined)}>
          <h3>{pendingImport.character.name}</h3>
          <p>
            Source: {pendingImport.rules.name} · rules revision {pendingImport.rules.version}. Destination:{' '}
            {c.rules.name} · revision {c.rules.version}.
          </p>
          {differences.length ? (
            <div className="notice-text">
              <strong>Different game rules</strong>
              <p>
                {differences.join(', ')} differ. Ratings, stunts, Fate points, and injuries will be retained
                as a draft for review; the campaign rules will stay unchanged.
              </p>
            </div>
          ) : (
            <p className="validation-good">The mechanical configuration matches this game.</p>
          )}
          {importIssues.length > 0 && (
            <div className="subpanel">
              <h3>Checks against this game</h3>
              {importIssues.map((issue, i) => (
                <p key={i}>{issue.message}</p>
              ))}
            </div>
          )}
          <p className="muted">
            Import creates an independent character with its portrait. Links to characters in the previous
            campaign are cleared; written backstory is retained. Current injury and Fate-point values are
            preserved.
          </p>
          <div className="modal-actions">
            <button onClick={() => setPendingImport(undefined)}>Cancel</button>
            <button
              className="button-primary"
              onClick={() => {
                void (async () => {
                  const prepared = prepareCharacterImport(pendingImport, c);
                  if (
                    await update((d) => {
                      d.characters.push(prepared.character);
                      d.assets.push(...prepared.assets);
                    })
                  ) {
                    setPendingImport(undefined);
                    setSelected(prepared.character.id);
                  }
                })();
              }}
            >
              Import as a new draft
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CharacterEditor({
  character,
  back,
  ...props
}: EditorProps & { character: Character; back: () => void }) {
  const { campaign: c, update, dispatch, notify, readOnly, playerActor } = props;
  const [form, setForm] = useState<Character>(structuredClone(character));
  const [printOpen, setPrintOpen] = useState(false);
  const [tab, setTab] = useState('aspects'),
    [dirty, setDirty] = useState(false),
    [saveFailed, setSaveFailed] = useState(false);
  const [milestone, setMilestone] = useState(false),
    [milestoneType, setMilestoneType] = useState<'minor' | 'significant' | 'major'>('minor'),
    [milestoneText, setMilestoneText] = useState('');
  const [majorConcept, setMajorConcept] = useState(''),
    [extremeRename, setExtremeRename] = useState('');
  const [choiceMilestone, setChoiceMilestone] = useState<Milestone>(),
    [stuntForm, setStuntForm] = useState<Stunt>();
  const [recovery, setRecovery] = useState<Consequence>(),
    [recoveryTotal, setRecoveryTotal] = useState(2),
    [selfTreatment, setSelfTreatment] = useState(false);
  const [skillToRaise, setSkillToRaise] = useState(''),
    [raiseCap, setRaiseCap] = useState(false);
  const [overrideDialog, setOverrideDialog] = useState(false),
    [overrideReason, setOverrideReason] = useState(''),
    [overrideDraft, setOverrideDraft] = useState('');
  const draftId = `editor:${c.id}:${character.id}`;
  const [recoveryDraft, setRecoveryDraft] = useState<CharacterDraft | undefined>(() =>
    readOnly ? undefined : listDrafts(c.id).find((draft) => draft.id === draftId),
  );
  const savedBase = useRef(structuredClone(character)),
    locallyBackedUp = useRef(true);
  const quickAspectIds = useRef(new Set(character.aspects.filter((a) => !a.name.trim()).map((a) => a.id)));
  const quickSkillIds = useRef(
    new Set(c.rules.skills.filter((s) => !(character.skills[s.id] > 0)).map((s) => s.id)),
  );
  const formRef = useRef(form);
  formRef.current = form;
  const pending = useRef(false),
    editCounter = useRef(0),
    expectedRevision = useRef(character.revision);
  const inflight = useRef<Promise<boolean> | undefined>(undefined);
  const updateRef = useRef(update);
  updateRef.current = update;
  const hadPlay =
    c.events.some((e) => e.characterId === character.id || e.roll?.characterId === character.id) ||
    character.milestones.length > 0;
  const inPlay = hadPlay || form.status === 'ready';
  const locked = form.kind === 'pc' && inPlay && !overrideReason;
  const stats = deriveCharacter(form, c.rules),
    issues = validateCharacter(form, c.rules),
    portrait = c.assets.find((a) => a.id === form.portraitAssetId);
  const persistPending = () => {
    if (!pending.current || readOnly) return;
    try {
      const draft = makeDraft(c.id, savedBase.current);
      saveDraft({
        ...draft,
        id: draftId,
        baseRevision: expectedRevision.current,
        proposed: structuredClone(formRef.current),
      });
      locallyBackedUp.current = true;
    } catch {
      locallyBackedUp.current = false;
      setSaveFailed(true);
      notify('Draft backup storage is full. Export this character before leaving the sheet.', true);
    }
  };
  async function save(): Promise<boolean> {
    if (inflight.current) {
      const success = await inflight.current;
      return success && pending.current ? save() : success;
    }
    if (!pending.current || readOnly) return true;
    persistPending();
    const snapshot = structuredClone(formRef.current),
      counter = editCounter.current,
      baseRevision = expectedRevision.current;
    const promise = updateRef.current((d) => {
      if (d.id !== c.id)
        throw new Error(
          'The campaign changed before this sheet saved. Its unsaved draft is retained in the original campaign.',
        );
      const index = d.characters.findIndex((ch) => ch.id === snapshot.id);
      if (index < 0) throw new Error('This character was removed.');
      if (d.characters[index].revision !== baseRevision)
        throw new Error(
          'This character changed while you were editing. Export your draft, then reopen the current character to compare.',
        );
      d.characters[index] = { ...snapshot, revision: baseRevision + 1 };
      if (overrideReason)
        d.events.push({
          id: id(),
          commandId: id(),
          sequence: (d.events.at(-1)?.sequence ?? 0) + 1,
          timestamp: new Date().toISOString(),
          actorId: d.members.find((m) => m.role === 'gm')?.id || 'gm',
          type: 'sheetOverride',
          characterId: snapshot.id,
          visibility: snapshot.visibility,
          summary: `GM sheet adjustment: ${snapshot.name}`,
          detail: overrideReason,
        });
    });
    inflight.current = promise;
    const success = await promise;
    inflight.current = undefined;
    if (!success) {
      setSaveFailed(true);
      return false;
    }
    expectedRevision.current = baseRevision + 1;
    formRef.current.revision = baseRevision + 1;
    savedBase.current = { ...snapshot, revision: baseRevision + 1 };
    if (editCounter.current === counter) {
      pending.current = false;
      setDirty(false);
      try {
        deleteDraft(draftId);
      } catch {
        /* An extra recovery copy is safe. */
      }
    } else persistPending();
    setSaveFailed(false);
    return pending.current ? save() : true;
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      void saveRef.current();
    }, 600);
    return () => clearTimeout(timer);
  }, [form, dirty]);
  useEffect(
    () => () => {
      if (pending.current) {
        persistPending();
        void saveRef.current();
      }
    },
    [],
  );
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (pending.current && !locallyBackedUp.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  useEffect(() => {
    if (!pending.current && !inflight.current) {
      expectedRevision.current = character.revision;
      savedBase.current = structuredClone(character);
      formRef.current = structuredClone(character);
      setForm(structuredClone(character));
    }
  }, [character.revision]);
  const edit = (fn: (draft: Character) => void) => {
    const next = structuredClone(formRef.current);
    fn(next);
    if (locked && form.creationMode === 'quick') {
      const error = validateCharacter(next, c.rules).find((issue) => issue.severity === 'error');
      if (error) {
        notify(error.message, true);
        return;
      }
    }
    if (
      !hadPlay &&
      formRef.current.status === 'draft' &&
      next.kind === 'pc' &&
      deriveCharacter(next, c.rules).refresh !== deriveCharacter(formRef.current, c.rules).refresh
    )
      next.fatePoints = Math.max(0, deriveCharacter(next, c.rules).refresh);
    formRef.current = next;
    pending.current = true;
    editCounter.current++;
    setForm(next);
    setDirty(true);
    setSaveFailed(false);
    persistPending();
  };
  const command = async (input: Parameters<EditorProps['dispatch']>[0]) => {
    if (!(await save())) return false;
    return dispatch(input);
  };
  const canRaise = skillToRaise
    ? supportedColumns({ ...form.skills, [skillToRaise]: (form.skills[skillToRaise] || 0) + 1 })
    : false;
  const exceedsCap = skillToRaise ? (form.skills[skillToRaise] || 0) + 1 > c.rules.skillCap : false;
  return (
    <>
      <div className="character-default-print">
        <PrintFolio />
        {(() => {
          const shared = campaignForPrint(
            {
              ...c,
              characters: c.characters.map((ch) => (ch.id === form.id ? form : ch)),
            },
            false,
            readOnly ? playerActor : undefined,
          );
          const printable = shared.characters.find((ch) => ch.id === form.id);
          return printable ? (
            <CharacterSheet campaign={shared} character={printable} includeDetails />
          ) : (
            <p>Choose a GM copy from Print character to print this private character.</p>
          );
        })()}
      </div>
      {printOpen && (
        <PrintDialog
          campaign={{ ...c, characters: c.characters.map((ch) => (ch.id === form.id ? form : ch)) }}
          characterId={form.id}
          readOnly={readOnly}
          playerActor={playerActor}
          close={() => setPrintOpen(false)}
        />
      )}
      <div className="character-screen">
        <button
          className="back-link"
          onClick={() => {
            void save().then((ok) => {
              if (ok) back();
            });
          }}
        >
          <ArrowLeft size={16} />
          All characters
        </button>
        <div className="character-heading">
          <div className="avatar large">
            {portrait ? <img src={portrait.dataUrl} alt={form.name} /> : initials(form.name)}
          </div>
          <div>
            <p className="eyebrow">{form.kind === 'pc' ? 'PROTAGONIST' : `${form.kind.toUpperCase()} NPC`}</p>
            <h1>{form.name}</h1>
            <p>{form.aspects.find((a) => a.kind === 'highConcept')?.name || 'Your high concept goes here'}</p>
          </div>
          <div className="actions no-print">
            <span className="save-label">
              {saveFailed ? 'Save failed — draft retained' : dirty ? 'Saving draft…' : 'Draft saved'}
            </span>
            <button aria-label="Print character" onClick={() => setPrintOpen(true)}>
              <Printer size={16} /> Print
            </button>
            <button
              aria-label="Export character"
              onClick={() => {
                void exportCharacter(
                  { ...c, characters: c.characters.map((ch) => (ch.id === form.id ? form : ch)) },
                  form.id,
                )
                  .then((text) => downloadFile(text, `${slug(form.name)}.json`))
                  .catch((e) => notify(e.message, true));
              }}
            >
              <Download size={16} />
            </button>
          </div>
        </div>
        <div className="sheet-summary">
          <div>
            <span>Fate points</span>
            <strong>{form.fatePoints}</strong>
          </div>
          <div>
            <span>Refresh</span>
            <strong>{stats.refresh}</strong>
          </div>
          <div>
            <span>Stunts</span>
            <strong>
              {form.stunts.length}
              <small> / {c.rules.freeStunts} free</small>
            </strong>
          </div>
          {stats.tracks.map((t) => (
            <div key={t.id}>
              <span>{t.name} stress</span>
              <div className="stress-boxes">
                {t.boxes.map((v) => (
                  <span key={v} className={(form.stress[t.id] || []).includes(v) ? 'checked' : ''}>
                    {v}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="tabs no-print">
          {[
            ['aspects', 'Aspects & story'],
            ['skills', 'Skills'],
            ['stunts', 'Stunts & extras'],
            ['growth', 'Growth & recovery'],
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        <fieldset disabled={readOnly} className="unframed">
          <div className="sheet-layout">
            <div>
              {locked && (
                <p className="notice-text">
                  This character is ready for play. Use milestones for mechanical changes; quick creation can
                  still fill empty choices. A GM sheet adjustment requires a recorded reason.
                </p>
              )}
              {overrideReason && (
                <p className="notice-text">
                  GM adjustment active: {overrideReason}{' '}
                  <button
                    className="button-text"
                    onClick={() => {
                      void save().then((ok) => {
                        if (ok) setOverrideReason('');
                      });
                    }}
                  >
                    Finish adjustment
                  </button>
                </p>
              )}
              {tab === 'aspects' && (
                <>
                  <section className="panel">
                    <h2>
                      <Feather size={18} /> Who are you?
                    </h2>
                    <div className="form-grid">
                      <Field label="Name">
                        <input
                          value={form.name}
                          onChange={(e) =>
                            edit((d) => {
                              d.name = e.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Pronouns">
                        <input
                          value={form.pronouns}
                          onChange={(e) =>
                            edit((d) => {
                              d.pronouns = e.target.value;
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Description">
                      <textarea
                        rows={3}
                        value={form.description}
                        onChange={(e) =>
                          edit((d) => {
                            d.description = e.target.value;
                          })
                        }
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="Creation mode">
                        <select
                          disabled={locked}
                          value={form.creationMode}
                          onChange={(e) =>
                            edit((d) => {
                              d.creationMode = e.target.value as Character['creationMode'];
                            })
                          }
                        >
                          <option value="full">Full creation</option>
                          <option value="quick">Quick creation</option>
                        </select>
                      </Field>
                      <Field label="Visibility">
                        <select
                          value={form.visibility}
                          onChange={(e) =>
                            edit((d) => {
                              d.visibility = e.target.value as 'shared' | 'gm';
                            })
                          }
                        >
                          <option value="shared">Shared with the table</option>
                          <option value="gm">GM only</option>
                        </select>
                      </Field>
                    </div>
                    {form.kind === 'supporting' && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={!!form.npcTough}
                          onChange={(e) =>
                            edit((d) => {
                              d.npcTough = e.target.checked;
                            })
                          }
                        />
                        Especially tough supporting NPC · add a moderate consequence slot
                      </label>
                    )}
                    <label className="button">
                      <Plus size={15} />
                      Upload portrait
                      <input
                        hidden
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file)
                            void (async () => {
                              if (!(await save())) return;
                              const asset = await createAsset(file, form.visibility);
                              if (
                                await update((d) => {
                                  d.assets.push(asset);
                                })
                              )
                                edit((d) => {
                                  d.portraitAssetId = asset.id;
                                });
                            })().catch((error) => notify(error.message, true));
                        }}
                      />
                    </label>
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Aspects</h2>
                      <Badge>
                        <a href={coreRuleSource('character-creation').url} target="_blank" rel="noreferrer">
                          {coreRuleSource('character-creation').label}
                        </a>
                      </Badge>
                    </div>
                    {form.aspects.map((aspect, i) => (
                      <Field
                        key={aspect.id}
                        label={
                          aspect.kind === 'highConcept'
                            ? 'High concept'
                            : aspect.kind === 'trouble'
                              ? 'Trouble'
                              : aspect.kind === 'consequence'
                                ? 'Consequence aspect'
                                : `Aspect ${i - 1}`
                        }
                        hint={
                          aspect.kind === 'highConcept'
                            ? 'What kind of person are you? What do you do?'
                            : aspect.kind === 'trouble'
                              ? 'What complicates your life?'
                              : undefined
                        }
                      >
                        <input
                          disabled={
                            locked &&
                            !(form.creationMode === 'quick' && quickAspectIds.current.has(aspect.id))
                          }
                          placeholder={
                            aspect.kind === 'highConcept'
                              ? 'A daring captain with a stolen ship'
                              : aspect.kind === 'trouble'
                                ? 'I owe the wrong people'
                                : 'A truth that can help or complicate things'
                          }
                          value={aspect.name}
                          onChange={(e) =>
                            edit((d) => {
                              d.aspects[i].name = e.target.value;
                            })
                          }
                        />
                      </Field>
                    ))}
                    {form.aspects.length < c.rules.aspectCount && !locked && (
                      <button
                        onClick={() =>
                          edit((d) => {
                            d.aspects.push({
                              id: id(),
                              name: '',
                              kind: 'character',
                              freeInvokes: 0,
                              visibility: d.visibility,
                              ownerId: d.id,
                            });
                          })
                        }
                      >
                        <Plus size={16} />
                        Add aspect
                      </button>
                    )}
                  </section>
                  {form.phases.length > 0 && (
                    <section className="panel">
                      <h2>Crossing paths</h2>
                      <p className="muted">
                        Your first adventure, and how the other protagonists became part of it.
                      </p>
                      {form.phases.map((phase, i) => (
                        <div className="phase" key={phase.id}>
                          <span className="phase-number">0{i + 1}</span>
                          <div>
                            <Field label={i === 0 ? 'Your first adventure' : `Crossing paths · ${i}`}>
                              <textarea
                                rows={3}
                                value={phase.story}
                                onChange={(e) =>
                                  edit((d) => {
                                    d.phases[i].story = e.target.value;
                                  })
                                }
                              />
                            </Field>
                            <Field label="Connected characters">
                              <select
                                multiple
                                value={phase.characterIds}
                                onChange={(e) => {
                                  const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
                                  edit((d) => {
                                    d.phases[i].characterIds = ids;
                                  });
                                }}
                              >
                                {c.characters
                                  .filter((ch) => ch.id !== form.id && ch.kind === 'pc')
                                  .map((ch) => (
                                    <option key={ch.id} value={ch.id}>
                                      {ch.name}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                          </div>
                        </div>
                      ))}
                    </section>
                  )}
                </>
              )}
              {tab === 'skills' && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>What you’re good at</h2>
                    <Badge>
                      <a href={coreRuleSource('skills').url} target="_blank" rel="noreferrer">
                        {coreRuleSource('skills').label}
                      </a>
                    </Badge>
                  </div>
                  <p className="muted">
                    Unselected skills are Mediocre (+0).{' '}
                    {form.creationMode === 'quick' &&
                      'Empty slots stay available as you discover your character.'}{' '}
                    {form.milestones.some((m) => m.type !== 'minor') &&
                      'Advancement uses supported columns, not the creation pyramid.'}
                  </p>
                  <div className="pyramid">
                    {Object.entries(c.rules.skillSlots)
                      .sort(([a], [b]) => Number(b) - Number(a))
                      .map(([rank, count]) => (
                        <div key={rank}>
                          <strong>{signed(Number(rank))}</strong>
                          <span>
                            {Object.values(form.skills).filter((n) => n === Number(rank)).length}
                            {!form.milestones.some((m) => m.type !== 'minor')
                              ? ` / ${count} slots`
                              : ' skills'}
                          </span>
                          <div>
                            {Object.entries(form.skills)
                              .filter(([, n]) => n === Number(rank))
                              .map(([s]) => (
                                <Badge key={s}>{c.rules.skills.find((x) => x.id === s)?.name || s}</Badge>
                              ))}
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="skill-picker">
                    {c.rules.skills.map((skill) => (
                      <Field key={skill.id} label={skill.name} hint={skill.description}>
                        <select
                          aria-label={`${skill.name} rating`}
                          disabled={
                            locked &&
                            !(
                              form.creationMode === 'quick' &&
                              quickSkillIds.current.has(skill.id) &&
                              !form.milestones.length
                            )
                          }
                          value={form.skills[skill.id] || 0}
                          onChange={(e) =>
                            edit((d) => {
                              if (Number(e.target.value) === 0) delete d.skills[skill.id];
                              else d.skills[skill.id] = Number(e.target.value);
                            })
                          }
                        >
                          {Array.from(
                            { length: Math.max(c.rules.skillCap, form.skills[skill.id] || 0) + 1 },
                            (_, n) => (
                              <option value={n} key={n}>
                                {signed(n)}
                                {n === 0 ? ' · Unselected' : ''}
                              </option>
                            ),
                          )}
                        </select>
                      </Field>
                    ))}
                  </div>
                </section>
              )}
              {tab === 'stunts' && (
                <>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Your special edge</h2>
                      <button
                        disabled={locked && form.creationMode !== 'quick'}
                        onClick={() => setStuntForm(emptyStunt())}
                      >
                        <Plus size={16} />
                        Add stunt
                      </button>
                    </div>
                    <p className="muted">
                      The first {c.rules.freeStunts} standard stunts are free. In-play quick creation charges
                      paid stunts immediately. Full characters buy or replace stunts through a milestone.
                    </p>
                    {form.stunts.map((stunt, i) => (
                      <div className="subpanel" key={stunt.id}>
                        <div className="inline-form">
                          <Field label="Stunt name">
                            <input
                              disabled={locked}
                              value={stunt.name}
                              onChange={(e) =>
                                edit((d) => {
                                  d.stunts[i].name = e.target.value;
                                })
                              }
                            />
                          </Field>
                          {!locked && (
                            <ConfirmButton
                              title="Remove this stunt?"
                              onConfirm={() =>
                                edit((d) => {
                                  d.stunts.splice(i, 1);
                                })
                              }
                            />
                          )}
                        </div>
                        <Field label="Effect & conditions">
                          <textarea
                            disabled={locked}
                            rows={3}
                            placeholder="Because I…, I get +2 to… when…"
                            value={stunt.description}
                            onChange={(e) =>
                              edit((d) => {
                                d.stunts[i].description = e.target.value;
                              })
                            }
                          />
                        </Field>
                        <div className="form-grid">
                          <Field label="Fate point activation cost">
                            <input
                              disabled={locked}
                              type="number"
                              min="0"
                              max="10"
                              value={stunt.fateCost}
                              onChange={(e) =>
                                edit((d) => {
                                  d.stunts[i].fateCost = Number(e.target.value);
                                })
                              }
                            />
                          </Field>
                          <Field label="Usage limit">
                            <select
                              disabled={locked}
                              value={stunt.limit}
                              onChange={(e) =>
                                edit((d) => {
                                  d.stunts[i].limit = e.target.value as typeof stunt.limit;
                                })
                              }
                            >
                              {['none', 'scene', 'conflict', 'session'].map((limit) => (
                                <option key={limit}>{limit}</option>
                              ))}
                            </select>
                          </Field>
                          {stunt.limit !== 'none' && (
                            <Field label="Uses per period">
                              <input
                                disabled={locked}
                                type="number"
                                min="1"
                                max="20"
                                value={stunt.maxUses}
                                onChange={(e) =>
                                  edit((d) => {
                                    d.stunts[i].maxUses = Number(e.target.value);
                                  })
                                }
                              />
                            </Field>
                          )}
                        </div>
                      </div>
                    ))}
                    {!form.stunts.length && (
                      <Empty
                        icon={<Sparkles />}
                        title="A little something extra"
                        text="A trick, talent, or exception that makes this character distinctive."
                      />
                    )}
                  </section>
                  <section className="panel">
                    <h2>Extras & personal notes</h2>
                    <Field
                      label="Extras"
                      hint="Special equipment, magic, vehicles, or other features. Record their permissions and costs."
                    >
                      <textarea
                        rows={5}
                        value={form.extras}
                        onChange={(e) =>
                          edit((d) => {
                            d.extras = e.target.value;
                          })
                        }
                      />
                    </Field>
                    <Field label="Notes">
                      <textarea
                        rows={4}
                        value={form.notes}
                        onChange={(e) =>
                          edit((d) => {
                            d.notes = e.target.value;
                          })
                        }
                      />
                    </Field>
                  </section>
                </>
              )}
              {tab === 'growth' && (
                <>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Milestones</h2>
                      {form.kind === 'pc' && (
                        <button
                          onClick={() => {
                            setMilestone(true);
                            setMajorConcept('');
                            setExtremeRename('');
                          }}
                        >
                          <Plus size={16} />
                          Award milestone
                        </button>
                      )}
                    </div>
                    <p>
                      Banked skill points: <strong>{form.bankedSkillPoints}</strong>
                    </p>
                    {form.milestones.map((m) => (
                      <div className="timeline-entry" key={m.id}>
                        <Badge>{m.type}</Badge>
                        <p>{m.description}</p>
                        <small>{new Date(m.timestamp).toLocaleDateString()}</small>
                        {!m.choiceUsed && (
                          <button onClick={() => setChoiceMilestone(m)}>Choose milestone change</button>
                        )}
                      </div>
                    ))}
                    {!form.milestones.length && (
                      <p className="muted">
                        Growth follows the story. Award milestones when the table reaches a meaningful turning
                        point.
                      </p>
                    )}
                    {form.bankedSkillPoints > 0 && (
                      <div className="subpanel">
                        <Field label="Spend a banked skill point">
                          <select
                            value={skillToRaise}
                            onChange={(e) => {
                              setSkillToRaise(e.target.value);
                              setRaiseCap(false);
                            }}
                          >
                            <option value="">Choose a skill to raise…</option>
                            {c.rules.skills.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} · {signed(form.skills[s.id] || 0)} →{' '}
                                {signed((form.skills[s.id] || 0) + 1)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {skillToRaise && (
                          <p className={canRaise ? 'muted' : 'notice-text'}>
                            {canRaise
                              ? 'The resulting skill columns have support at every rank.'
                              : 'This increase needs more supporting skills at lower ranks.'}
                          </p>
                        )}
                        {exceedsCap && (
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              disabled={form.milestones.at(-1)?.type !== 'major'}
                              checked={raiseCap}
                              onChange={(e) => setRaiseCap(e.target.checked)}
                            />
                            Increase the campaign skill cap at this major milestone
                          </label>
                        )}
                        <button
                          disabled={!skillToRaise || !canRaise || (exceedsCap && !raiseCap)}
                          onClick={() => {
                            void command({
                              type: 'spendSkill',
                              characterId: form.id,
                              skillId: skillToRaise,
                              raiseCap,
                            }).then((ok) => {
                              if (ok) setSkillToRaise('');
                            });
                          }}
                        >
                          Spend 1 skill point
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="panel">
                    <h2>Consequences</h2>
                    {form.consequences.length ? (
                      form.consequences.map((con) => (
                        <div key={con.id} className="subpanel">
                          <strong>
                            {con.value} · {con.name}
                          </strong>
                          <p>
                            {con.value === 8
                              ? 'An extreme consequence becomes a changed character aspect at a major milestone.'
                              : con.recovering
                                ? `Recovering since ${new Date(con.recoveryStartedAt!).toLocaleDateString()} — allow a whole ${con.value === 2 ? 'scene' : con.value === 4 ? 'session' : 'scenario'} after treatment begins.`
                                : 'Recovery has not begun.'}
                          </p>
                          {con.value !== 8 && (
                            <div className="actions">
                              <button
                                disabled={con.recovering}
                                onClick={() => {
                                  setRecovery(con);
                                  setRecoveryTotal(con.value);
                                  setSelfTreatment(false);
                                }}
                              >
                                Begin recovery
                              </button>
                              <button
                                disabled={!con.recovering}
                                onClick={() => {
                                  setRecovery(con);
                                }}
                              >
                                Confirm full recovery period
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        No lasting consequences. Stress and consequences are applied at the table.
                      </p>
                    )}
                  </section>
                </>
              )}
            </div>
            <aside className="sheet-aside">
              <section className="panel validation-panel">
                <h3>
                  <Shield size={17} /> Character check
                </h3>
                {issues.length ? (
                  issues.map((issue, i) => (
                    <div className={`validation-issue ${issue.severity}`} key={`${issue.field}-${i}`}>
                      <strong>{issue.message}</strong>
                      <small>
                        {issue.sourceUrl ? (
                          <a href={issue.sourceUrl} target="_blank" rel="noreferrer">
                            {issue.source}
                          </a>
                        ) : (
                          issue.source
                        )}
                      </small>
                    </div>
                  ))
                ) : (
                  <div className="validation-good">
                    <CheckCircle2 />
                    <p>Everything checks out.</p>
                  </div>
                )}
                <button
                  className="button-primary full-width"
                  disabled={form.status === 'ready' && hadPlay}
                  onClick={() => {
                    if (form.status !== 'ready') {
                      const errors = validateCharacter({ ...form, status: 'ready' }, c.rules).filter(
                        (i) => i.severity === 'error',
                      );
                      if (errors.length) {
                        notify(errors[0].message, true);
                        return;
                      }
                    }
                    edit((d) => {
                      d.status = d.status === 'ready' ? 'draft' : 'ready';
                    });
                  }}
                >
                  {form.status === 'ready' ? (hadPlay ? 'In play' : 'Return to draft') : 'Mark ready to play'}
                </button>
                {inPlay && !overrideReason && (
                  <button
                    className="button-text"
                    onClick={() => {
                      setOverrideDialog(true);
                      setOverrideDraft('');
                    }}
                  >
                    Record a GM sheet adjustment
                  </button>
                )}
              </section>
              <section className="note-card">
                <Sparkles size={22} />
                <h3>Both sides of the coin</h3>
                <p>
                  A good aspect helps you shine and gets you into trouble. Give your GM something to work
                  with.
                </p>
              </section>
              <ConfirmButton
                className="button-text danger"
                title={`Delete ${form.name}?`}
                onConfirm={() => {
                  pending.current = false;
                  void update((d) => {
                    releaseCharacterInventory(d, form.id);
                    d.characters = d.characters.filter((ch) => ch.id !== form.id);
                    d.members.forEach((m) => {
                      m.characterIds = m.characterIds.filter((characterId) => characterId !== form.id);
                    });
                    d.characters.forEach((ch) =>
                      ch.phases.forEach((phase) => {
                        phase.characterIds = phase.characterIds.filter(
                          (characterId) => characterId !== form.id,
                        );
                      }),
                    );
                  }).then((ok) => {
                    if (ok) back();
                  });
                }}
              >
                Delete character
              </ConfirmButton>
            </aside>
          </div>
        </fieldset>
      </div>
      {stuntForm && (
        <Modal title="A new stunt" close={() => setStuntForm(undefined)}>
          <StuntFields value={stuntForm} onChange={setStuntForm} />
          <p className="notice-text">
            {locked && form.creationMode === 'quick'
              ? `In-play cost: ${Math.max(0, stats.refresh - deriveCharacter({ ...form, stunts: [...form.stunts, stuntForm] }, c.rules).refresh)} current Fate point(s). `
              : ''}
            Refresh after adding:{' '}
            {deriveCharacter({ ...form, stunts: [...form.stunts, stuntForm] }, c.rules).refresh}.
          </p>
          <div className="modal-actions">
            <button onClick={() => setStuntForm(undefined)}>Cancel</button>
            <button
              className="button-primary"
              disabled={!stuntForm.name.trim() || !stuntForm.description.trim()}
              onClick={() => {
                void (async () => {
                  if (
                    deriveCharacter({ ...form, stunts: [...form.stunts, stuntForm] }, c.rules).refresh < 1
                  ) {
                    notify('This stunt would reduce refresh below 1.', true);
                    return;
                  }
                  if (inPlay && !overrideReason) {
                    if (await command({ type: 'learnStunt', characterId: form.id, stunt: stuntForm }))
                      setStuntForm(undefined);
                  } else {
                    edit((d) => {
                      d.stunts.push(stuntForm);
                    });
                    if (await save()) setStuntForm(undefined);
                  }
                })();
              }}
            >
              Save stunt
            </button>
          </div>
        </Modal>
      )}
      {milestone && (
        <Modal title="A turning point" close={() => setMilestone(false)}>
          <Field label="Milestone">
            <select
              value={milestoneType}
              onChange={(e) => setMilestoneType(e.target.value as typeof milestoneType)}
            >
              <option value="minor">Minor · a change of direction</option>
              <option value="significant">Significant · a scenario resolved</option>
              <option value="major">Major · the world has changed</option>
            </select>
          </Field>
          <Field label="What happened?">
            <textarea value={milestoneText} onChange={(e) => setMilestoneText(e.target.value)} rows={4} />
          </Field>
          {milestoneType === 'major' && (
            <>
              <Field label="New high concept (optional)">
                <input
                  value={majorConcept}
                  onChange={(e) => setMajorConcept(e.target.value)}
                  placeholder={form.aspects.find((a) => a.kind === 'highConcept')?.name}
                />
              </Field>
              {form.consequences.some((con) => con.value === 8) && (
                <Field
                  label="Rename the extreme consequence"
                  hint="Describe the permanent change after its worst effects pass; do not simply restore the old aspect."
                >
                  <input value={extremeRename} onChange={(e) => setExtremeRename(e.target.value)} />
                </Field>
              )}
            </>
          )}
          <p className="muted">
            {milestoneType === 'minor'
              ? 'One eligible equivalent change.'
              : milestoneType === 'significant'
                ? 'One equivalent change and one bankable skill point.'
                : 'One equivalent change, one skill point, and one additional refresh.'}{' '}
            After awarding, use “Choose milestone change” to spend its equivalent change.
          </p>
          <div className="modal-actions">
            <button onClick={() => setMilestone(false)}>Cancel</button>
            <button
              className="button-primary"
              disabled={!milestoneText.trim()}
              onClick={() => {
                void command({
                  type: 'milestone',
                  characterId: form.id,
                  milestone: milestoneType,
                  description: milestoneText,
                  highConcept: majorConcept || undefined,
                  extremeAspectName: extremeRename || undefined,
                }).then((ok) => {
                  if (ok) {
                    setMilestone(false);
                    setMilestoneText('');
                  }
                });
              }}
            >
              Award milestone
            </button>
          </div>
        </Modal>
      )}
      {choiceMilestone && (
        <MilestoneDialog
          character={form}
          rules={c.rules}
          milestone={choiceMilestone}
          close={() => setChoiceMilestone(undefined)}
          submit={async (choice) => {
            if (
              await command({
                type: 'milestoneChoice',
                characterId: form.id,
                milestoneId: choiceMilestone.id,
                choice,
              })
            )
              setChoiceMilestone(undefined);
          }}
        />
      )}
      {recovery && (
        <Modal
          title={recovery.recovering ? 'Confirm narrative recovery' : 'Begin consequence recovery'}
          close={() => setRecovery(undefined)}
        >
          <h3>{recovery.name}</h3>
          {recovery.recovering ? (
            <p>
              A whole {recovery.value === 2 ? 'scene' : recovery.value === 4 ? 'session' : 'scenario'} must
              have passed after recovery began, with appropriate narrative care. This is a table judgment, not
              elapsed clock time.
            </p>
          ) : (
            <>
              <Field label="Treatment roll total">
                <input
                  type="number"
                  value={recoveryTotal}
                  onChange={(e) => setRecoveryTotal(Number(e.target.value))}
                />
              </Field>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selfTreatment}
                  onChange={(e) => setSelfTreatment(e.target.checked)}
                />
                Self-treatment · increase difficulty by 2
              </label>
              <p className="muted">
                Required opposition: {signed(recovery.value + (selfTreatment ? 2 : 0))}. Confirm that the
                fiction permits this treatment.
              </p>
            </>
          )}
          <div className="modal-actions">
            <button onClick={() => setRecovery(undefined)}>Not yet</button>
            <button
              className="button-primary"
              onClick={() => {
                void command({
                  type: 'recover',
                  characterId: form.id,
                  consequenceId: recovery.id,
                  stage: recovery.recovering ? 'clear' : 'start',
                  recoveryTotal,
                  selfTreatment,
                  wholePeriodElapsed: recovery.recovering,
                }).then((ok) => {
                  if (ok) setRecovery(undefined);
                });
              }}
            >
              {recovery.recovering ? 'Confirm full period & clear' : 'Confirm treatment & begin'}
            </button>
          </div>
        </Modal>
      )}
      {overrideDialog && (
        <Modal title="Record a GM sheet adjustment" close={() => setOverrideDialog(false)}>
          <p>
            Use this for a deliberate house rule or correction. Mechanical changes will be saved with this
            reason in the campaign log.
          </p>
          <Field label="Reason">
            <textarea rows={3} value={overrideDraft} onChange={(e) => setOverrideDraft(e.target.value)} />
          </Field>
          <div className="modal-actions">
            <button onClick={() => setOverrideDialog(false)}>Cancel</button>
            <button
              className="button-primary"
              disabled={!overrideDraft.trim()}
              onClick={() => {
                setOverrideReason(overrideDraft.trim());
                setOverrideDialog(false);
              }}
            >
              Enable recorded adjustments
            </button>
          </div>
        </Modal>
      )}
      {recoveryDraft && (
        <Modal title="Recover unsaved character edits" close={() => setRecoveryDraft(undefined)}>
          <p>
            A local draft was retained before a sheet save completed. It is separate from the current campaign
            character.
          </p>
          <p>Changed fields: {compareDraft(recoveryDraft, character).changedFields.join(', ') || 'none'}.</p>
          {compareDraft(recoveryDraft, character).stale && (
            <p className="notice-text">
              The campaign character has changed since this draft began. Export the draft to compare it with
              the current sheet. It will not replace newer Fate points, skills, or injuries.
            </p>
          )}
          <div className="modal-actions">
            <button
              onClick={() => {
                void exportCharacter(
                  {
                    ...c,
                    characters: c.characters.map((ch) =>
                      ch.id === character.id ? recoveryDraft.proposed : ch,
                    ),
                  },
                  character.id,
                )
                  .then((text) => downloadFile(text, `${slug(character.name)}-unsaved-draft.json`))
                  .catch((error) => notify(error.message, true));
              }}
            >
              Export unsaved draft
            </button>
            <button
              disabled={compareDraft(recoveryDraft, character).stale}
              className="button-primary"
              onClick={() => {
                savedBase.current = structuredClone(recoveryDraft.base);
                expectedRevision.current = recoveryDraft.baseRevision;
                formRef.current = structuredClone(recoveryDraft.proposed);
                pending.current = true;
                editCounter.current++;
                setForm(structuredClone(recoveryDraft.proposed));
                setDirty(true);
                setRecoveryDraft(undefined);
              }}
            >
              Restore unsaved edits
            </button>
            <button
              onClick={() => {
                deleteDraft(recoveryDraft.id);
                setRecoveryDraft(undefined);
              }}
            >
              Discard saved draft
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function StuntFields({ value, onChange }: { value: Stunt; onChange: (value: Stunt) => void }) {
  return (
    <>
      <Field label="Stunt name">
        <input autoFocus value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </Field>
      <Field label="Effect & conditions">
        <textarea
          rows={3}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder="Because I…, I get +2 to… when…"
        />
      </Field>
      <div className="form-grid">
        <Field label="Fate point activation cost">
          <input
            type="number"
            min="0"
            max="10"
            value={value.fateCost}
            onChange={(e) => onChange({ ...value, fateCost: Number(e.target.value) })}
          />
        </Field>
        <Field label="Usage limit">
          <select
            value={value.limit}
            onChange={(e) => onChange({ ...value, limit: e.target.value as Stunt['limit'] })}
          >
            {['none', 'scene', 'conflict', 'session'].map((limit) => (
              <option key={limit}>{limit}</option>
            ))}
          </select>
        </Field>
        {value.limit !== 'none' && (
          <Field label="Uses per period">
            <input
              type="number"
              min="1"
              max="20"
              value={value.maxUses}
              onChange={(e) => onChange({ ...value, maxUses: Number(e.target.value) })}
            />
          </Field>
        )}
      </div>
    </>
  );
}
function MilestoneDialog({
  character,
  rules,
  milestone,
  close,
  submit,
}: {
  character: Character;
  rules: EditorProps['campaign']['rules'];
  milestone: Milestone;
  close: () => void;
  submit: (choice: MilestoneChoice) => Promise<void>;
}) {
  const [kind, setKind] = useState<MilestoneChoice['kind']>('renameAspect'),
    [first, setFirst] = useState(''),
    [second, setSecond] = useState(''),
    [aspectId, setAspectId] = useState(''),
    [name, setName] = useState(''),
    [stuntId, setStuntId] = useState('');
  const [stunt, setStunt] = useState<Stunt>(emptyStunt());
  const choice: MilestoneChoice =
    kind === 'swapSkills'
      ? { kind, first, second }
      : kind === 'renameAspect'
        ? { kind, aspectId, name }
        : kind === 'replaceStunt'
          ? { kind, stuntId, stunt }
          : { kind, stunt };
  let preview = '',
    invalid = '';
  try {
    const result = applyMilestoneChoice(character, rules, choice, milestone.type === 'major');
    preview = `Resulting refresh: ${deriveCharacter(result, rules).refresh}. This uses the milestone’s one equivalent change.`;
    if ((kind === 'buyStunt' || kind === 'replaceStunt') && (!stunt.name.trim() || !stunt.description.trim()))
      invalid = 'Name and describe the stunt.';
  } catch (error) {
    invalid = error instanceof Error ? error.message : String(error);
  }
  return (
    <Modal title="Choose a milestone change" close={close}>
      <Field label="Eligible change">
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="renameAspect">Rename one character aspect</option>
          <option value="swapSkills">Swap skill ratings / replace an Average skill</option>
          <option value="replaceStunt">Replace one stunt</option>
          <option value="buyStunt">Buy one new stunt</option>
        </select>
      </Field>
      {kind === 'renameAspect' && (
        <>
          <Field label="Aspect">
            <select value={aspectId} onChange={(e) => setAspectId(e.target.value)}>
              <option value="">Choose an aspect…</option>
              {character.aspects
                .filter(
                  (a) => a.kind !== 'consequence' && (milestone.type === 'major' || a.kind !== 'highConcept'),
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.kind}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="New wording">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </>
      )}
      {kind === 'swapSkills' && (
        <div className="form-grid">
          {[
            ['First skill', first, setFirst],
            ['Second skill', second, setSecond],
          ].map(([label, value, setter]) => (
            <Field key={String(label)} label={String(label)}>
              <select value={String(value)} onChange={(e) => (setter as (v: string) => void)(e.target.value)}>
                <option value="">Choose a skill…</option>
                {rules.skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name} ({signed(character.skills[skill.id] || 0)})
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      )}
      {kind === 'replaceStunt' && (
        <Field label="Stunt to replace">
          <select value={stuntId} onChange={(e) => setStuntId(e.target.value)}>
            <option value="">Choose a stunt…</option>
            {character.stunts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {(kind === 'replaceStunt' || kind === 'buyStunt') && <StuntFields value={stunt} onChange={setStunt} />}
      <p className={invalid ? 'notice-text' : 'muted'}>{invalid || preview}</p>
      <div className="modal-actions">
        <button onClick={close}>Keep this choice for later</button>
        <button className="button-primary" disabled={!!invalid} onClick={() => void submit(choice)}>
          Apply milestone change
        </button>
      </div>
    </Modal>
  );
}
