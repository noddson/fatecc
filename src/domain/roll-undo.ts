import type { Aspect, Campaign, RollRecord, RollUndoChange } from './types';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function captureRollChanges(before: Campaign, after: Campaign): RollUndoChange[] {
  const changes: RollUndoChange[] = [];
  function entries<T extends { id: string }>(
    a: T[],
    b: T[],
    make: (id: string, before?: T, after?: T) => RollUndoChange,
  ) {
    for (const id of new Set([...a, ...b].map((x) => x.id))) {
      const old = a.find((x) => x.id === id),
        next = b.find((x) => x.id === id);
      if (!same(old, next)) changes.push(make(id, old, next));
    }
  }
  const aspects = (
    a: Aspect[],
    b: Aspect[],
    location: 'issues' | 'scene' | 'character',
    characterId?: string,
  ) => entries(a, b, (id, before, after) => ({ kind: 'aspect', location, characterId, id, before, after }));
  aspects(before.issues, after.issues, 'issues');
  aspects(before.play.aspects, after.play.aspects, 'scene');
  entries(before.play.pendingAwards, after.play.pendingAwards, (id, before, after) => ({
    kind: 'award',
    id,
    before,
    after,
  }));
  if (before.play.npcFatePoints !== after.play.npcFatePoints)
    changes.push({ kind: 'fate', delta: after.play.npcFatePoints - before.play.npcFatePoints });
  for (const old of before.characters) {
    const next = after.characters.find((x) => x.id === old.id)!;
    const characterId = old.id;
    aspects(old.aspects, next.aspects, 'character', characterId);
    entries(old.consequences, next.consequences, (id, before, after) => ({
      kind: 'consequence',
      characterId,
      id,
      before,
      after,
    }));
    if (old.fatePoints !== next.fatePoints)
      changes.push({ kind: 'fate', characterId, delta: next.fatePoints - old.fatePoints });
    for (const field of ['takenOut', 'extremeUsed'] as const)
      if (old[field] !== next[field])
        changes.push({ kind: 'flag', characterId, field, before: old[field], after: next[field] });
    for (const track of new Set([...Object.keys(old.stress), ...Object.keys(next.stress)]))
      for (const box of new Set([...(old.stress[track] || []), ...(next.stress[track] || [])])) {
        const before = (old.stress[track] || []).includes(box),
          after = (next.stress[track] || []).includes(box);
        if (before !== after) changes.push({ kind: 'stress', characterId, track, box, before, after });
      }
  }
  return structuredClone(changes);
}

/** Mutates a command's private clone; callers commit only if every guard succeeds. */
export function reverseRoll(campaign: Campaign, roll: RollRecord): void {
  if (roll.undone) throw new Error('This roll has already been undone.');
  const start = campaign.events.findIndex((e) => e.type === 'roll' && e.roll?.id === roll.id);
  if (start < 0) throw new Error('The original roll is unavailable.');
  const later = campaign.events.slice(start);
  const related = later.filter((e) => e.roll?.id === roll.id);
  const undoneIds = new Set(campaign.events.filter((e) => e.roll?.undone).map((e) => e.roll!.id));
  const createdAspects = new Set(
    related.flatMap((event) =>
      (event.undoChanges || []).flatMap((change) =>
        change.kind === 'aspect' && !change.before && change.after ? [change.id] : [],
      ),
    ),
  );
  if (
    later.some(
      (event) =>
        event.roll &&
        event.roll.id !== roll.id &&
        !undoneIds.has(event.roll.id) &&
        event.roll.invocations.some((invocation) => createdAspects.has(invocation.aspectId)),
    )
  )
    throw new Error(
      'An effect of this roll has since changed or been used. Undo the dependent roll first, or correct the affected state manually.',
    );
  const affected = new Set([roll.characterId, roll.targetCharacterId]);
  for (const event of related)
    for (const change of event.undoChanges || [])
      if ('characterId' in change && change.characterId) affected.add(change.characterId);
  if (
    later.some(
      (e) =>
        e.roll?.id !== roll.id &&
        !(e.roll && undoneIds.has(e.roll.id)) &&
        e.characterId &&
        affected.has(e.characterId) &&
        ['concede', 'takenOut', 'milestone', 'milestoneChoice', 'recover'].includes(e.type),
    )
  )
    throw new Error(
      'An affected character has since conceded, been taken out, recovered, or reached a milestone. Correct the affected state manually.',
    );
  if (later.some((e) => e.type === 'boundary' || e.type === 'breather'))
    throw new Error(
      'A scene, session, conflict, or recovery boundary has passed. Correct the affected state manually.',
    );
  if (related.some((e) => !e.undoChanges)) {
    // Old untouched rolls have only an exchange action to restore; older side effects lack evidence.
    if (related.length !== 1 || roll.finalized || roll.invocations.length)
      throw new Error(
        'This older roll has no saved undo history for its effects. Correct the affected state manually.',
      );
  }
  const touched = new Set<string>();
  const character = (id: string) => {
    const c = campaign.characters.find((c) => c.id === id);
    if (!c) throw new Error('An affected character was removed. Correct the roll manually.');
    touched.add(id);
    return c;
  };
  const changed = () => {
    throw new Error(
      'An effect of this roll has since changed or been used. Undo the dependent roll first, or correct the affected state manually.',
    );
  };
  function restore<T extends { id: string }>(items: T[], change: { id: string; before?: T; after?: T }) {
    const index = items.findIndex((x) => x.id === change.id);
    if (!same(items[index], change.after)) changed();
    if (change.before) {
      if (index < 0) items.push(structuredClone(change.before));
      else items[index] = structuredClone(change.before);
    } else if (index >= 0) items.splice(index, 1);
  }
  for (const event of related.reverse())
    for (const change of [...(event.undoChanges || [])].reverse()) {
      switch (change.kind) {
        case 'aspect':
          restore(
            change.location === 'issues'
              ? campaign.issues
              : change.location === 'scene'
                ? campaign.play.aspects
                : character(change.characterId!).aspects,
            change,
          );
          break;
        case 'consequence':
          restore(character(change.characterId).consequences, change);
          break;
        case 'award':
          restore(campaign.play.pendingAwards, change);
          break;
        case 'fate': {
          const c = change.characterId ? character(change.characterId) : undefined;
          const value = (c ? c.fatePoints : campaign.play.npcFatePoints) - change.delta;
          if (value < 0) changed();
          if (c) c.fatePoints = value;
          else campaign.play.npcFatePoints = value;
          break;
        }
        case 'flag': {
          const c = character(change.characterId);
          if (c[change.field] !== change.after) changed();
          c[change.field] = change.before;
          break;
        }
        case 'stress': {
          const c = character(change.characterId),
            boxes = c.stress[change.track] || [];
          if (boxes.includes(change.box) !== change.after) changed();
          c.stress[change.track] = change.before
            ? [...boxes, change.box].sort((a, b) => a - b)
            : boxes.filter((b) => b !== change.box);
          break;
        }
      }
    }
  const sameExchange =
    roll.exchange !== undefined
      ? roll.exchange === campaign.play.exchange
      : !later.some((e) => e.type === 'nextExchange');
  if (
    roll.conflictId &&
    roll.conflictId === campaign.play.conflictId &&
    sameExchange &&
    roll.action !== 'defend'
  )
    campaign.play.actedIds = campaign.play.actedIds.filter((id) => id !== roll.characterId);
  for (const id of touched) character(id).revision++;
}
