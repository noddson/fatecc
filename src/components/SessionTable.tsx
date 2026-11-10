import { useState } from 'react';
import {
  Check,
  ChevronRight,
  Dices,
  Flag,
  Heart,
  History,
  Plus,
  Pencil,
  Shield,
  Sparkles,
  Swords,
  Target,
} from 'lucide-react';
import { controlledCharacters, playerName } from '../domain/player-view';
import { activeRolls } from '../domain/commands';
import { deriveCharacter, initiative, resolveMobHit, validateHarm } from '../domain/rules';
import { id } from '../domain/defaults';
import type { Action, Character, RollRecord } from '../domain/types';
import { StressHelp } from './StressHelp';
import { invocationAspectGroups } from './invocation-aspects';
import {
  Badge,
  ConfirmButton,
  Empty,
  Field,
  Modal,
  PageTitle,
  initials,
  signed,
  type EditorProps,
} from '../ui';
const actions: [Action, string][] = [
  ['overcome', 'Overcome'],
  ['advantage', 'Create an advantage'],
  ['attack', 'Attack'],
  ['defend', 'Defend'],
];
const actionGlyphs: Record<Action, string> = { overcome: 'O', advantage: 'C', attack: 'A', defend: 'D' };
export function SessionTable({
  campaign: c,
  update,
  dispatch,
  notify,
  readOnly,
  playerActor,
  playDisabled,
}: EditorProps) {
  const controlled = controlledCharacters(c, readOnly, playerActor);
  const [chosenCharacterId, setCharacterId] = useState('');
  const characterId =
    controlled.find((ch) => ch.id === chosenCharacterId)?.id ||
    controlled.find((ch) => ch.kind === 'pc')?.id ||
    controlled[0]?.id ||
    '';
  const canAct = (id: string) => !playDisabled && controlled.some((ch) => ch.id === id);
  const [skillId, setSkillId] = useState(c.rules.skills[0]?.id || '');
  const [action, setAction] = useState<Action>('overcome');
  const [opposition, setOpposition] = useState(2);
  const [modifier, setModifier] = useState(0);
  const [targetId, setTargetId] = useState('');
  const [existing, setExisting] = useState(false);
  const [helpers, setHelpers] = useState<string[]>([]);
  const [aspectText, setAspectText] = useState('');
  const [boundary, setBoundary] = useState<'scene' | 'session' | 'scenario' | 'conflict'>();
  const [boundaryName, setBoundaryName] = useState('');
  const [conflictType, setConflictType] = useState<'physical' | 'mental'>('physical');
  const [selectedRollId, setSelectedRollId] = useState('');
  const [hostile, setHostile] = useState(false);
  const [sourceRollId, setSourceRollId] = useState('');
  const [attackerId, setAttackerId] = useState('');
  const [extremeAspectId, setExtremeAspectId] = useState('');
  const [extremeName, setExtremeName] = useState('');
  const [boundaryPhase, setBoundaryPhase] = useState<'start' | 'end'>('start');
  const [breather, setBreather] = useState(false);
  const [sceneParticipants, setSceneParticipants] = useState<string[]>([]);
  const [npcInteraction, setNpcInteraction] = useState(true);
  const [mobOpen, setMobOpen] = useState(false);
  const [mobIds, setMobIds] = useState<string[]>([]);
  const [mobShifts, setMobShifts] = useState(1);
  const [invoke, setInvoke] = useState<RollRecord>();
  const [invokeAspect, setInvokeAspect] = useState('');
  const [free, setFree] = useState(false);
  const [finalize, setFinalize] = useState<RollRecord>();
  const [resultName, setResultName] = useState('');
  const [existingAspect, setExistingAspect] = useState('');
  const [tradeBoost, setTradeBoost] = useState(false);
  const [harm, setHarm] = useState<Character>();
  const [track, setTrack] = useState('physical');
  const [shifts, setShifts] = useState(2);
  const [stressBox, setStressBox] = useState(0);
  const [consequences, setConsequences] = useState<Record<string, string>>({});
  const [compelCarry, setCompelCarry] = useState(false);
  const [fateDialog, setFateDialog] = useState<{
    character: Character;
    type: 'compel' | 'adjust' | 'detail' | 'concede' | 'takenOut';
  }>();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(1);
  const [contestName, setContestName] = useState('');
  const [taskName, setTaskName] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const [correction, setCorrection] = useState<string>();
  const [undo, setUndo] = useState<RollRecord>();
  const [undoReason, setUndoReason] = useState('Accidental roll');
  const current = c.characters.find((ch) => ch.id === characterId);
  const rolls = activeRolls(c);
  const reviewRolls = readOnly
    ? rolls.filter((r) => controlled.some((ch) => ch.id === r.characterId))
    : rolls;
  const roll = reviewRolls.find((r) => r.id === selectedRollId) || reviewRolls.at(-1);
  const aspects = [...c.issues, ...c.play.aspects, ...c.characters.flatMap((ch) => ch.aspects)].filter((a) =>
    a.name.trim(),
  );
  const invokeGroups = invoke ? invocationAspectGroups(c, invoke.characterId, !!readOnly) : [];
  const sourceHit = sourceRollId ? rolls.find((r) => r.id === sourceRollId) : undefined;
  const harmConsequences = Object.entries(consequences)
    .filter(([, name]) => name.trim())
    .map(([key, name]) => ({
      value: Number(key.split(':')[0]),
      trackId: key.split(':')[1] || undefined,
      name,
    }));
  let harmError = '';
  if (harm) {
    try {
      validateHarm(harm, c.rules, track, shifts, stressBox || undefined, harmConsequences, !!extremeAspectId);
      if (extremeAspectId && !extremeName.trim())
        harmError = 'Name the lasting change from the extreme consequence.';
      if (sourceHit && !sourceHit.finalized) harmError = 'Finalize this attack before applying its harm.';
    } catch (e) {
      harmError = e instanceof Error ? e.message : String(e);
    }
  }
  let mobPreview = '';
  if (mobIds.length) {
    try {
      const result = resolveMobHit(
        mobIds.map((memberId) => c.characters.find((ch) => ch.id === memberId)!),
        c.rules,
        mobShifts,
      );
      mobPreview = `${result.takenOutIds.length} taken out; ${result.characters.filter((ch) => !ch.takenOut).length} remain; ${result.remainingShifts} shifts overflow.`;
    } catch (e) {
      mobPreview = e instanceof Error ? e.message : String(e);
    }
  }
  const openBoundary = (
    kind: 'scene' | 'session' | 'scenario' | 'conflict',
    phase: 'start' | 'end' = 'start',
  ) => {
    setBoundary(kind);
    setBoundaryPhase(phase);
    setBoundaryName('');
    setBreather(false);
    setSceneParticipants(c.characters.filter((ch) => ch.kind === 'pc').map((ch) => ch.id));
    setNpcInteraction(true);
  };
  const openHarm = (ch: Character) => {
    setHarm(ch);
    setTrack(deriveCharacter(ch, c.rules).tracks[0]?.id || 'physical');
    setStressBox(0);
    setConsequences({});
    setExtremeAspectId('');
    setExtremeName('');
    const hit = rolls
      .filter(
        (r) =>
          r.action === 'attack' &&
          r.targetCharacterId === ch.id &&
          !r.harmResolved &&
          r.conflictId === c.play.conflictId,
      )
      .at(-1);
    setSourceRollId(hit?.id || '');
    setAttackerId(hit?.characterId || '');
    setShifts(hit ? Math.max(1, hit.shifts - (hit.explanation.includes('one shift traded') ? 1 : 0)) : 2);
  };
  const openFate = (ch: Character, type: NonNullable<typeof fateDialog>['type']) => {
    setFateDialog({ character: ch, type });
    setReason('');
    setAmount(1);
    setCompelCarry(false);
  };
  return (
    <>
      <PageTitle
        eyebrow="THE SHARED TABLE"
        title={c.play.sessionName || 'Let the dice tell a story'}
        text={c.play.scenarioName || 'A place for the whole table to follow the action.'}
        actions={
          !readOnly && (
            <>
              <button onClick={() => openBoundary('scenario')}>New scenario</button>
              <button onClick={() => openBoundary('session', 'end')}>End session</button>
              <button className="button-primary" onClick={() => openBoundary('session')}>
                <Plus size={16} />
                Start session
              </button>
            </>
          )
        }
      />
      <div className="scene-strip">
        <div>
          <span className="eyebrow">CURRENT SCENE</span>
          <strong>{c.play.sceneName || 'Set the scene'}</strong>
        </div>
        <Badge>{c.play.npcFatePoints} NPC Fate points</Badge>
        {c.play.conflictId && (
          <Badge tone="brand-tone">
            {c.play.conflictType} conflict · exchange {c.play.exchange}
          </Badge>
        )}
        {!readOnly && (
          <div className="actions">
            <button onClick={() => openBoundary('scene')}>
              New scene
              <ChevronRight size={15} />
            </button>
            <button onClick={() => openBoundary('scene', 'end')}>End scene</button>
            {c.play.conflictId ? (
              <>
                <button onClick={() => void dispatch({ type: 'nextExchange' })}>Next exchange</button>
                <button onClick={() => openBoundary('conflict', 'end')}>End conflict</button>
              </>
            ) : (
              <>
                <button onClick={() => openBoundary('conflict')}>
                  <Swords size={15} />
                  Start conflict
                </button>
                <button onClick={() => void dispatch({ type: 'breather' })}>Take a breather</button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="table-layout">
        <div className="table-main">
          <section className="panel roll-panel">
            <div className="section-heading">
              <h2>
                <span className="fate-glyph" aria-hidden="true">
                  {actionGlyphs[action]}
                </span>{' '}
                Make your move
              </h2>
              <Badge>4dF + skill</Badge>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSelectedRollId('');
                void dispatch({
                  type: 'roll',
                  characterId,
                  action,
                  skillId,
                  opposition,
                  modifier,
                  advantageExisting: existing,
                  helperIds: helpers,
                  targetCharacterId: targetId || undefined,
                });
              }}
            >
              <fieldset className="unframed" disabled={playDisabled || !controlled.length}>
                <div className="form-grid">
                  <Field label="Character">
                    <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
                      <option value="" disabled>
                        Choose a character
                      </option>
                      {controlled.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Action">
                    <select value={action} onChange={(e) => setAction(e.target.value as Action)}>
                      {actions.map(([key, label]) => (
                        <option value={key} key={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Skill">
                    <select value={skillId} onChange={(e) => setSkillId(e.target.value)}>
                      {c.rules.skills.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name} ({signed(current?.skills[s.id] || 0)})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Opposition"
                    hint="The number after “vs”: set the difficulty or opposing roll’s total before rolling."
                  >
                    <input
                      type="number"
                      min="-20"
                      max="30"
                      value={opposition}
                      onChange={(e) => setOpposition(Number(e.target.value))}
                    />
                  </Field>
                </div>
                <details className="roll-options">
                  <summary>Modifiers, teamwork & targets</summary>
                  <div className="form-grid">
                    <Field label="Stunt / situational modifier">
                      <input
                        type="number"
                        min="-20"
                        max="20"
                        value={modifier}
                        onChange={(e) => setModifier(Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Target (for attacks)">
                      <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                        <option value="">No specific target</option>
                        {c.characters
                          .filter((ch) => ch.id !== characterId)
                          .map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {ch.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field
                      label="Teamwork helpers"
                      hint="Each helper needs at least +1 in the selected skill."
                    >
                      <select
                        multiple
                        value={helpers}
                        onChange={(e) => setHelpers(Array.from(e.target.selectedOptions).map((o) => o.value))}
                      >
                        {c.characters
                          .filter((ch) => ch.id !== characterId)
                          .map((ch) => (
                            <option value={ch.id} key={ch.id}>
                              {ch.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    {action === 'advantage' && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={existing}
                          onChange={(e) => setExisting(e.target.checked)}
                        />
                        Use an existing aspect
                      </label>
                    )}
                  </div>
                </details>
                <button className="button-primary roll-button" disabled={!current}>
                  <Dices size={18} />
                  Roll the dice{' '}
                  <span>
                    {signed(current?.skills[skillId] || 0)}{' '}
                    {c.rules.skills.find((s) => s.id === skillId)?.name}
                  </span>
                </button>
              </fieldset>
              {playDisabled && (
                <p className="muted">Read-only while disconnected. Reconnect to the GM to make a move.</p>
              )}
              {!controlled.length && <p className="muted">The GM has not assigned a character to you yet.</p>}
            </form>
          </section>
          {reviewRolls.length > 1 && (
            <Field
              label="Roll to review"
              hint="Open rolls can still change. Finalized rolls are here for reference; attack harm may still need applying separately."
            >
              <select value={roll?.id || ''} onChange={(e) => setSelectedRollId(e.target.value)}>
                {[...reviewRolls].reverse().map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.characterName} · {r.action} {signed(r.total)} · {r.finalized ? 'finalized' : 'open'}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {roll && (
            <section className={`panel roll-result ${roll.outcome}`}>
              <div className="section-heading">
                <span className="eyebrow">
                  {roll.characterName} · {actions.find(([key]) => key === roll.action)?.[1]}
                </span>
                <Badge>{roll.finalized ? 'Finalized' : 'Open for invocations'}</Badge>
              </div>
              <div className="roll-result-main">
                <div className="dice-row">
                  {roll.dice.map((die, i) => (
                    <span
                      className={`fate-die ${die > 0 ? 'positive' : die < 0 ? 'negative' : 'blank'}`}
                      key={i}
                      role="img"
                      aria-label={`Die ${i + 1}: ${die > 0 ? 'plus one' : die < 0 ? 'minus one' : 'blank'}`}
                    >
                      <span className="fate-glyph" aria-hidden="true">
                        {die > 0 ? '+' : die < 0 ? '-' : '0'}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="roll-total">
                  <strong>{signed(roll.total)}</strong>
                  <span>
                    {roll.outcome === 'style'
                      ? 'Success with style'
                      : roll.outcome === 'failure'
                        ? 'A complication'
                        : roll.outcome === 'tie'
                          ? 'A tie'
                          : 'Success'}
                  </span>
                </div>
              </div>
              <p className="roll-math">
                Dice {signed(roll.dice.reduce((a, b) => a + b, 0))} + {roll.skillName} {signed(roll.skill)} +
                modifiers {signed(roll.modifier)}
                {roll.invocations.length
                  ? ` + invocations ${signed(roll.invocations.reduce((n, i) => n + i.bonus, 0))}`
                  : ''}{' '}
                · opposition {signed(roll.opposition)}
              </p>
              <p className="outcome-explanation">{roll.explanation}</p>
              {roll.invocations.length > 0 && (
                <div className="tags">
                  {roll.invocations.map((inv, i) => (
                    <Badge key={i}>
                      {inv.name} · {inv.free ? 'free' : '1 FP'} · {inv.reroll ? 'reroll' : '+2'}
                    </Badge>
                  ))}
                </div>
              )}
              {!roll.finalized && canAct(roll.characterId) && (
                <div className="actions">
                  <button
                    onClick={() => {
                      setInvoke(roll);
                      setInvokeAspect('');
                      setFree(false);
                      setHostile(false);
                    }}
                  >
                    <Sparkles size={16} />
                    Invoke an aspect
                  </button>
                  <button
                    className="button-primary"
                    onClick={() => {
                      setFinalize(roll);
                      setResultName('');
                      setExistingAspect('');
                      setTradeBoost(false);
                    }}
                  >
                    <Check size={16} />
                    Accept the outcome
                  </button>
                </div>
              )}
              {!readOnly && (
                <button
                  onClick={() => {
                    setUndo(roll);
                    setUndoReason('Accidental roll');
                  }}
                >
                  Undo roll
                </button>
              )}
            </section>
          )}
          <section className="panel">
            <div className="section-heading">
              <h2>
                <History size={18} /> The story so far
              </h2>
              <button className="button-text" onClick={() => setShowHistory(!showHistory)}>
                {showHistory ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {showHistory && (
              <div className="activity-log">
                {[...c.events]
                  .reverse()
                  .slice(0, 100)
                  .map((event) => (
                    <div className="activity-entry" key={event.id}>
                      <span className={`event-dot ${event.type === 'roll' ? 'gold' : ''}`} />
                      <div>
                        <div className="activity-meta">
                          <span>
                            {new Date(event.timestamp).toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <Badge>{event.type}</Badge>
                          {event.roll &&
                            c.events.some((e) => e.roll?.id === event.roll?.id && e.roll?.undone) && (
                              <Badge>Undone</Badge>
                            )}
                          {event.visibility === 'gm' && <small>GM only</small>}
                          {event.visibility === 'character' && <small>Character only</small>}
                          {!readOnly && (
                            <button
                              className="icon-button activity-correction"
                              title="Record correction"
                              aria-label={`Record correction: ${event.summary}`}
                              onClick={() => {
                                setCorrection(event.id);
                                setReason('');
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                        </div>
                        <strong>{event.summary}</strong>
                        {event.detail && <p>{event.detail}</p>}
                        {event.roll && (
                          <p className="inline-roll">
                            {event.roll.dice.map((d) => (d > 0 ? '+' : d < 0 ? '−' : '0')).join(' ')}{' '}
                            <span>
                              → {signed(event.roll.total)} vs {signed(event.roll.opposition)}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                {!c.events.length && (
                  <Empty
                    icon={<Dices />}
                    title="The page is still blank"
                    text="Roll the dice or start a scene. Accepted actions are recorded here for the whole table."
                  />
                )}
              </div>
            )}
          </section>
        </div>
        <aside className="table-aside">
          <section className="panel">
            <div className="section-heading">
              <h2>
                <Flag size={18} /> Scene aspects
              </h2>
              <Badge>{c.play.aspects.length}</Badge>
            </div>
            {c.play.aspects.map((aspect) => (
              <div className="scene-aspect" key={aspect.id}>
                <strong>{aspect.name}</strong>
                <div>
                  <Badge>{aspect.kind}</Badge>
                  <small>{aspect.freeInvokes} free invokes</small>
                  {!readOnly && (
                    <ConfirmButton
                      title="Remove this scene aspect?"
                      onConfirm={() =>
                        void update((d) => {
                          d.play.aspects = d.play.aspects.filter((a) => a.id !== aspect.id);
                        })
                      }
                    />
                  )}
                </div>
              </div>
            ))}
            {!c.play.aspects.length && (
              <p className="muted">A slippery deck. A room full of witnesses. What matters in this scene?</p>
            )}
            {!readOnly && (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (aspectText.trim()) {
                    void update((d) => {
                      d.play.aspects.push({
                        id: id(),
                        name: aspectText.trim(),
                        kind: 'situation',
                        freeInvokes: 0,
                        visibility: 'shared',
                      });
                    });
                    setAspectText('');
                  }
                }}
              >
                <input
                  aria-label="New scene aspect"
                  value={aspectText}
                  onChange={(e) => setAspectText(e.target.value)}
                  placeholder="Name an aspect…"
                />
                <button className="icon-button" aria-label="Add scene aspect">
                  <Plus size={18} />
                </button>
              </form>
            )}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>
                <Shield size={18} /> Around the table
              </h2>
              {!readOnly && c.characters.some((ch) => ch.kind === 'nameless' && !ch.takenOut) && (
                <button
                  onClick={() => {
                    setMobIds([]);
                    setMobShifts(1);
                    setMobOpen(true);
                  }}
                >
                  Mob harm
                </button>
              )}
            </div>
            {c.characters.map((ch) => {
              const stats = deriveCharacter(ch, c.rules);
              return (
                <div className="roster-character" key={ch.id}>
                  <div className="roster-heading">
                    <span className="avatar small">{initials(ch.name)}</span>
                    <strong>
                      {ch.name}
                      {playerName(c, ch) && <small className="player-name">{playerName(c, ch)}</small>}
                      <small>
                        {ch.conceded
                          ? 'Conceded'
                          : ch.takenOut
                            ? 'Taken out'
                            : ch.kind === 'pc'
                              ? `${stats.refresh} refresh`
                              : ch.kind}
                      </small>
                    </strong>
                    <span className="fate-counter">
                      {ch.kind === 'pc' ? ch.fatePoints : c.play.npcFatePoints}
                      <small>FP</small>
                    </span>
                  </div>
                  {stats.tracks.map((t) => (
                    <div className="roster-track" key={t.id}>
                      <StressHelp character={ch} track={t} compact />
                      <div className="stress-boxes">
                        {t.boxes.map((v: number) => (
                          <span key={v} className={(ch.stress[t.id] || []).includes(v) ? 'checked' : ''}>
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {ch.consequences.map((con) => (
                    <div className="consequence-line" key={con.id}>
                      {con.value} · {con.name}
                    </div>
                  ))}
                  <fieldset className="roster-actions unframed" disabled={!canAct(ch.id)}>
                    <button onClick={() => openHarm(ch)}>
                      <Heart size={13} />
                      Harm
                    </button>
                    {!readOnly && (
                      <>
                        <button onClick={() => openFate(ch, 'compel')}>Compel</button>
                        <button onClick={() => openFate(ch, 'adjust')}>± FP</button>
                      </>
                    )}
                    <button onClick={() => openFate(ch, 'detail')}>Story detail</button>
                    {c.play.conflictId && (
                      <>
                        <button onClick={() => openFate(ch, 'concede')}>Concede</button>
                        {!readOnly && <button onClick={() => openFate(ch, 'takenOut')}>Taken out</button>}
                      </>
                    )}
                  </fieldset>
                  {ch.stunts.length > 0 && (
                    <details>
                      <summary className="muted">Stunts</summary>
                      {ch.stunts.map((stunt) => (
                        <button
                          className="stunt-use"
                          disabled={!canAct(ch.id)}
                          key={stunt.id}
                          onClick={() =>
                            void dispatch({ type: 'useStunt', characterId: ch.id, stuntId: stunt.id })
                          }
                        >
                          {stunt.name}
                          <small>
                            {stunt.limit === 'none'
                              ? `${stunt.fateCost} FP`
                              : `${stunt.uses}/${stunt.maxUses} · ${stunt.limit}`}
                          </small>
                        </button>
                      ))}
                    </details>
                  )}
                </div>
              );
            })}
            {c.play.conflictId && (
              <div className="initiative">
                <strong>Core initiative</strong>
                <p>
                  {initiative(c.characters, c.play.conflictType)
                    .map((ch: Character) => ch.name)
                    .join(' → ')}
                </p>
              </div>
            )}
          </section>
          <section className="panel">
            <h2>
              <Target size={18} /> Challenges & contests
            </h2>
            {c.play.contest.name && (
              <>
                <h3>{c.play.contest.name}</h3>
                {Object.entries(c.play.contest.scores).map(([character, score]) => (
                  <div className="detail-line" key={character}>
                    <span>{c.characters.find((ch) => ch.id === character)?.name}</span>
                    <strong>
                      {score} / {c.play.contest.target}
                    </strong>
                  </div>
                ))}
              </>
            )}
            {!readOnly && (
              <>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void dispatch({ type: 'contest', name: contestName, reset: true });
                    setContestName('');
                  }}
                >
                  <input
                    aria-label="Contest name"
                    placeholder="Name a contest…"
                    value={contestName}
                    onChange={(e) => setContestName(e.target.value)}
                  />
                  <button className="icon-button" aria-label="Start contest">
                    <Plus size={16} />
                  </button>
                </form>
                {c.play.contest.name && (
                  <div className="actions">
                    <button
                      disabled={!current}
                      onClick={() => void dispatch({ type: 'contest', characterId, victories: 1 })}
                    >
                      +1 victory: {current?.name.split(' ')[0]}
                    </button>
                    <button
                      disabled={!current}
                      onClick={() => void dispatch({ type: 'contest', characterId, victories: 2 })}
                    >
                      +2 with style
                    </button>
                  </div>
                )}
              </>
            )}
            {c.play.challenge.tasks.map((task) => (
              <label className="checkbox-label" key={task.id}>
                <input
                  type="checkbox"
                  checked={task.complete}
                  disabled={readOnly}
                  onChange={(e) =>
                    void dispatch({ type: 'challenge', taskId: task.id, complete: e.target.checked })
                  }
                />
                {task.label}
              </label>
            ))}
            {!readOnly && (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void dispatch({ type: 'challenge', label: taskName });
                  setTaskName('');
                }}
              >
                <input
                  aria-label="Challenge task"
                  placeholder="Add a challenge task…"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                />
                <button className="icon-button" aria-label="Add challenge task">
                  <Plus size={16} />
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>
      {undo && (
        <Modal title="Undo roll" close={() => setUndo(undefined)}>
          <p>
            Undo {undo.characterName}’s {undo.skillName} roll, including its recorded invocations, outcome,
            and linked harm. Its current-exchange action becomes available again. The history stays visible as
            undone.
          </p>
          <p className="muted">
            If another action has used or changed its effects, undo that action first. Scene and recovery
            boundaries prevent undo.
          </p>
          <Field label="Reason for undo">
            <input value={undoReason} onChange={(e) => setUndoReason(e.target.value)} />
          </Field>
          <div className="modal-actions">
            <button onClick={() => setUndo(undefined)}>Cancel</button>
            <button
              className="button-danger"
              disabled={!undoReason.trim()}
              onClick={() =>
                void dispatch({ type: 'undoRoll', rollId: undo.id, reason: undoReason }).then((ok) => {
                  if (ok) {
                    setUndo(undefined);
                    setSelectedRollId('');
                  }
                })
              }
            >
              Confirm undo
            </button>
          </div>
        </Modal>
      )}
      {boundary && (
        <Modal
          title={`${boundaryPhase === 'start' ? 'Start' : 'End'} a ${boundary}`}
          close={() => setBoundary(undefined)}
        >
          {boundaryPhase === 'start' && (
            <Field label="Name">
              <input
                autoFocus
                value={boundaryName}
                onChange={(e) => setBoundaryName(e.target.value)}
                placeholder={`A new ${boundary}`}
              />
            </Field>
          )}
          {boundary === 'conflict' && boundaryPhase === 'start' && (
            <Field label="Conflict type">
              <select
                value={conflictType}
                onChange={(e) => setConflictType(e.target.value as typeof conflictType)}
              >
                <option value="physical">Physical · Notice / Athletics / Physique</option>
                <option value="mental">Mental · Empathy / Rapport / Will</option>
              </select>
            </Field>
          )}
          {boundary === 'conflict' && boundaryPhase === 'end' && (
            <label className="checkbox-label">
              <input type="checkbox" checked={breather} onChange={(e) => setBreather(e.target.checked)} />
              The characters have a breather: clear their stress
            </label>
          )}
          {boundary === 'scene' && boundaryPhase === 'start' && (
            <>
              <Field label="PCs participating in this scene" hint="One NPC Fate point per participating PC.">
                <select
                  multiple
                  value={sceneParticipants}
                  onChange={(e) =>
                    setSceneParticipants(Array.from(e.target.selectedOptions).map((option) => option.value))
                  }
                >
                  {c.characters
                    .filter((ch) => ch.kind === 'pc')
                    .map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name}
                      </option>
                    ))}
                </select>
              </Field>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={npcInteraction}
                  onChange={(e) => setNpcInteraction(e.target.checked)}
                />
                This scene has significant NPC interaction (use saved NPC carryover)
              </label>
            </>
          )}
          <p className="notice-text">
            {boundaryPhase === 'end'
              ? boundary === 'conflict'
                ? 'Concession awards become available. Stress remains unless a breather is confirmed; consequences remain.'
                : boundary === 'scene'
                  ? 'Hostile-invocation awards become available and scene aspects expire. End an ongoing conflict first.'
                  : 'Record the session ending. Ongoing stress, consequences, and conflict state stay intact.'
              : boundary === 'scenario'
                ? 'A new scenario resets every PC’s Fate points to refresh, including points saved above refresh.'
                : boundary === 'session'
                  ? 'A new session tops PCs up to refresh. Extra Fate points carry over; ongoing stress and consequences remain.'
                  : boundary === 'scene'
                    ? 'Starting a scene clears scene aspects, settles hostile-invocation awards, and resets the NPC pool for the selected participants.'
                    : 'A conflict tracks exchanges, actions, concessions, and stress.'}
          </p>
          <div className="modal-actions">
            <button onClick={() => setBoundary(undefined)}>Cancel</button>
            <button
              className="button-primary"
              onClick={() => {
                void dispatch({
                  type: 'boundary',
                  boundary,
                  phase: boundaryPhase,
                  name: boundaryName,
                  conflictType,
                  breather: boundaryPhase === 'end' && boundary === 'conflict' && breather,
                  participantIds: sceneParticipants,
                  npcInteraction,
                }).then((ok) => {
                  if (ok) setBoundary(undefined);
                });
              }}
            >
              {boundaryPhase === 'start' ? 'Start' : 'End'} {boundary}
            </button>
          </div>
        </Modal>
      )}
      {invoke && (
        <Modal title="Make an aspect matter" close={() => setInvoke(undefined)}>
          <p>Explain how the aspect applies, then choose its benefit.</p>
          <Field label="Aspect">
            <select
              value={invokeAspect}
              onChange={(e) => {
                setInvokeAspect(e.target.value);
                const selected = aspects.find((a) => a.id === e.target.value);
                const attached = selected?.ownerId;
                setHostile(!!attached && attached === invoke.targetCharacterId);
                setFree(selected?.kind === 'boost');
              }}
            >
              <option value="">Choose an aspect…</option>
              {invokeGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.aspects.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.freeInvokes ? ` · ${a.freeInvokes} free` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={free}
              disabled={aspects.find((a) => a.id === invokeAspect)?.kind === 'boost'}
              onChange={(e) => setFree(e.target.checked)}
            />
            Spend a free invocation
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={hostile}
              disabled={free}
              onChange={(e) => setHostile(e.target.checked)}
            />
            Hostile invocation against the character this aspect belongs to
          </label>
          <p className="muted">
            A paid hostile invocation gives that character a Fate point after this scene. Helpful uses of
            another character’s aspect and free invocations do not transfer points.
          </p>
          <div className="modal-actions">
            <button
              disabled={!invokeAspect || !canAct(invoke.characterId)}
              onClick={() => {
                void dispatch({
                  type: 'invoke',
                  rollId: invoke.id,
                  aspectId: invokeAspect,
                  free,
                  hostile,
                  mode: 'reroll',
                }).then((ok) => {
                  if (ok) setInvoke(undefined);
                });
              }}
            >
              Reroll all four dice
            </button>
            <button
              className="button-primary"
              disabled={!invokeAspect || !canAct(invoke.characterId)}
              onClick={() => {
                void dispatch({
                  type: 'invoke',
                  rollId: invoke.id,
                  aspectId: invokeAspect,
                  free,
                  hostile,
                  mode: 'bonus',
                }).then((ok) => {
                  if (ok) setInvoke(undefined);
                });
              }}
            >
              Add +2
            </button>
          </div>
        </Modal>
      )}
      {finalize && (
        <Modal title="Accept the outcome" close={() => setFinalize(undefined)}>
          <p>{finalize.explanation}</p>
          <Field label="Name any resulting aspect or boost">
            <input
              value={resultName}
              onChange={(e) => setResultName(e.target.value)}
              placeholder="Caught off balance"
            />
          </Field>
          {finalize.advantageExisting && (
            <Field label="Existing aspect">
              <select value={existingAspect} onChange={(e) => setExistingAspect(e.target.value)}>
                <option value="">Choose the aspect…</option>
                {aspects
                  .filter((a) => a.kind !== 'boost')
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {finalize.action === 'attack' && finalize.outcome === 'style' && (
            <label className="checkbox-label">
              <input type="checkbox" checked={tradeBoost} onChange={(e) => setTradeBoost(e.target.checked)} />
              Trade one shift of damage for a boost
            </label>
          )}
          <p className="muted">
            Agree on any narrative costs at the table. Apply an attack’s harm to its target separately.
          </p>
          <div className="modal-actions">
            <button onClick={() => setFinalize(undefined)}>Keep the roll open</button>
            <button
              className="button-primary"
              disabled={!canAct(finalize.characterId)}
              onClick={() => {
                void dispatch({
                  type: 'finalizeRoll',
                  rollId: finalize.id,
                  aspectName: resultName,
                  existingAspectId: existingAspect || undefined,
                  reduceAttackForBoost: tradeBoost,
                }).then((ok) => {
                  if (ok) setFinalize(undefined);
                });
              }}
            >
              Finalize result
            </button>
          </div>
        </Modal>
      )}
      {harm && (
        <Modal title={`Harm · ${harm.name}`} close={() => setHarm(undefined)}>
          <Field label="Source of this hit">
            <select
              value={sourceRollId}
              onChange={(e) => {
                setSourceRollId(e.target.value);
                const hit = rolls.find((r) => r.id === e.target.value);
                setAttackerId(hit?.characterId || '');
                if (hit)
                  setShifts(Math.max(1, hit.shifts - (hit.explanation.includes('one shift traded') ? 1 : 0)));
              }}
            >
              <option value="">Separate hit / recorded at the physical table</option>
              {rolls
                .filter(
                  (r) =>
                    r.action === 'attack' &&
                    r.targetCharacterId === harm.id &&
                    !r.harmResolved &&
                    r.conflictId === c.play.conflictId,
                )
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.characterName} · {r.shifts} shifts{r.finalized ? '' : ' · finalize first'}
                  </option>
                ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Track">
              <select
                value={track}
                onChange={(e) => {
                  setTrack(e.target.value);
                  setStressBox(0);
                  setConsequences({});
                }}
              >
                {deriveCharacter(harm, c.rules).tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hit strength (shifts)">
              <input
                disabled={!!sourceHit}
                type="number"
                min="1"
                max="100"
                value={shifts}
                onChange={(e) => setShifts(Number(e.target.value))}
              />
            </Field>
          </div>
          {!sourceHit && (
            <Field label="Attacker (owns new free invocations)">
              <select value={attackerId} onChange={(e) => setAttackerId(e.target.value)}>
                <option value="">Unassigned · GM handles the free invocation</option>
                {c.characters
                  .filter((ch) => ch.id !== harm.id)
                  .map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Use one rated stress box">
            <select value={stressBox} onChange={(e) => setStressBox(Number(e.target.value))}>
              <option value="0">No stress box</option>
              {deriveCharacter(harm, c.rules)
                .tracks.find((t) => t.id === track)
                ?.boxes.filter((v) => !(harm.stress[track] || []).includes(v))
                .map((v) => (
                  <option value={v} key={v}>
                    Box {v} · absorbs {v} shifts
                  </option>
                ))}
            </select>
          </Field>
          <p className="muted">
            Add available consequences to absorb the remaining shifts. Give each injury a name.
          </p>
          {deriveCharacter(harm, c.rules)
            .consequenceSlots.filter(
              (slot) =>
                (!slot.trackId || slot.trackId === track) &&
                !harm.consequences.some((con) => con.value === slot.value && con.trackId === slot.trackId),
            )
            .map((slot, i) => {
              const key = `${slot.value}:${slot.trackId || ''}:${i}`;
              return (
                <Field
                  key={key}
                  label={`${slot.value}-shift consequence${slot.trackId ? ' · restricted' : ''}`}
                >
                  <input
                    placeholder="Leave blank to skip"
                    value={consequences[key] || ''}
                    onChange={(e) => setConsequences({ ...consequences, [key]: e.target.value })}
                  />
                </Field>
              );
            })}
          {(harm.kind === 'pc' || harm.kind === 'main') && !harm.extremeUsed && (
            <details>
              <summary>Last resort: an extreme consequence (8 shifts)</summary>
              <p className="notice-text">
                Permanently replace a non-high-concept aspect. This option can be used once between major
                milestones.
              </p>
              <Field label="Aspect to replace">
                <select value={extremeAspectId} onChange={(e) => setExtremeAspectId(e.target.value)}>
                  <option value="">Do not take an extreme consequence</option>
                  {harm.aspects
                    .filter((a) => a.kind !== 'highConcept' && a.kind !== 'consequence')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name || a.kind}
                      </option>
                    ))}
                </select>
              </Field>
              {extremeAspectId && (
                <Field label="Extreme consequence / new aspect">
                  <input
                    value={extremeName}
                    onChange={(e) => setExtremeName(e.target.value)}
                    placeholder="How does this change who you are?"
                  />
                </Field>
              )}
            </details>
          )}
          <p className={harmError ? 'notice-text' : 'muted'}>
            {harmError ||
              `${stressBox + harmConsequences.reduce((sum, con) => sum + con.value, 0) + (extremeAspectId ? 8 : 0)} shifts allocated against a ${shifts}-shift hit.`}
          </p>
          <div className="modal-actions">
            <button onClick={() => setHarm(undefined)}>Cancel</button>
            <button
              className="button-primary"
              disabled={!!harmError || !canAct(harm.id)}
              onClick={() => {
                void dispatch({
                  type: 'harm',
                  characterId: harm.id,
                  trackId: track,
                  shifts,
                  stressBox: stressBox || undefined,
                  consequences: harmConsequences,
                  sourceRollId: sourceRollId || undefined,
                  sourceCharacterId: sourceHit?.characterId || attackerId || undefined,
                  extremeAspectId: extremeAspectId || undefined,
                  extremeName: extremeName || undefined,
                }).then((ok) => {
                  if (ok) setHarm(undefined);
                });
              }}
            >
              Apply harm
            </button>
          </div>
        </Modal>
      )}
      {mobOpen && (
        <Modal title="Apply harm to a mob" close={() => setMobOpen(false)}>
          <p>
            Choose the nameless NPCs in this mob. Damage carries through them in the order shown; each uses
            its own remaining shared stress.
          </p>
          <Field label="Mob members">
            <select
              multiple
              value={mobIds}
              onChange={(e) => setMobIds(Array.from(e.target.selectedOptions).map((option) => option.value))}
            >
              {c.characters
                .filter((ch) => ch.kind === 'nameless' && !ch.takenOut)
                .map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Incoming shifts">
            <input
              type="number"
              min="1"
              max="100"
              value={mobShifts}
              onChange={(e) => setMobShifts(Number(e.target.value))}
            />
          </Field>
          {mobIds.length > 0 && <p className="notice-text">{mobPreview}</p>}
          <div className="modal-actions">
            <button onClick={() => setMobOpen(false)}>Cancel</button>
            <button
              className="button-primary"
              disabled={!mobIds.length || mobShifts < 1}
              onClick={() => {
                void dispatch({ type: 'mobHarm', characterIds: mobIds, shifts: mobShifts }).then((ok) => {
                  if (ok) setMobOpen(false);
                });
              }}
            >
              Apply mob harm
            </button>
          </div>
        </Modal>
      )}
      {fateDialog && (
        <Modal
          title={`${fateDialog.character.name} · ${fateDialog.type === 'compel' ? 'A complication' : fateDialog.type === 'adjust' ? 'Fate point adjustment' : fateDialog.type === 'detail' ? 'Declare a story detail' : fateDialog.type === 'concede' ? 'Concede the conflict' : 'Taken out'}`}
          close={() => setFateDialog(undefined)}
        >
          <Field
            label={fateDialog.type === 'compel' ? 'Agreed complication' : 'Reason / narrative agreement'}
          >
            <textarea autoFocus rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {fateDialog.type === 'adjust' && (
            <Field label="Adjustment">
              <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </Field>
          )}
          {fateDialog.type === 'compel' && fateDialog.character.kind !== 'pc' && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={compelCarry}
                onChange={(e) => setCompelCarry(e.target.checked)}
              />
              This compel ends this scene or starts the next: preserve the NPC award for the next significant
              NPC scene
            </label>
          )}
          {fateDialog.type === 'concede' && (
            <p className="notice-text">
              A concession must happen before the opponent rolls. Agree on the defeat. Fate points are awarded
              after the conflict.
            </p>
          )}
          <div className="modal-actions">
            <button onClick={() => setFateDialog(undefined)}>Cancel</button>
            {fateDialog.type === 'compel' && (
              <button
                disabled={!reason.trim() || !canAct(fateDialog.character.id)}
                onClick={() => {
                  void dispatch({
                    type: 'compel',
                    characterId: fateDialog.character.id,
                    reason,
                    accepted: false,
                  }).then((ok) => {
                    if (ok) setFateDialog(undefined);
                  });
                }}
              >
                Refuse · spend 1 FP
              </button>
            )}
            <button
              className="button-primary"
              disabled={!reason.trim() || !canAct(fateDialog.character.id)}
              onClick={() => {
                void (async () => {
                  const characterId = fateDialog.character.id;
                  let ok = false;
                  switch (fateDialog.type) {
                    case 'compel':
                      ok = await dispatch({
                        type: 'compel',
                        characterId,
                        reason,
                        accepted: true,
                        carryToNextScene: compelCarry,
                      });
                      break;
                    case 'adjust':
                      ok = await dispatch({ type: 'adjustFate', characterId, reason, amount });
                      break;
                    case 'detail':
                      ok = await dispatch({ type: 'storyDetail', characterId, description: reason });
                      break;
                    default:
                      ok = await dispatch({ type: fateDialog.type, characterId, reason });
                  }
                  if (ok) setFateDialog(undefined);
                })();
              }}
            >
              {fateDialog.type === 'compel'
                ? 'Accept · gain 1 FP'
                : fateDialog.type === 'detail'
                  ? 'Spend 1 FP & record'
                  : 'Confirm & record'}
            </button>
          </div>
        </Modal>
      )}
      {correction && (
        <Modal title="Record a correction" close={() => setCorrection(undefined)}>
          <p>
            The original event stays in the log. Describe the correction, then apply any needed value changes
            explicitly.
          </p>
          <Field label="Correction">
            <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="modal-actions">
            <button
              className="button-primary"
              disabled={!reason.trim()}
              onClick={() => {
                void dispatch({ type: 'correction', eventId: correction, reason }).then((ok) => {
                  if (ok) setCorrection(undefined);
                });
              }}
            >
              Append correction
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
