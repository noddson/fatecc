import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeRolls, applyCommand, latestRoll, type GameCommand } from './commands';
import { createCampaign, createCharacter, createAspect, CORE_RULES, id } from './defaults';
import type { Actor, Campaign } from './types';
import { campaignSchema } from '../storage/schema';
import { projectCampaign } from '../network/projection';
import { controlledCharacters, playerName } from './player-view';

const gm: Actor = { id: 'gm', role: 'gm', characterIds: [] };
type Input = GameCommand extends infer C ? (C extends GameCommand ? Omit<C, 'id'> : never) : never;
const run = (c: Campaign, command: Input, actor = gm) =>
  applyCommand(c, { ...command, id: id() } as GameCommand, actor);
const nativeCrypto = globalThis.crypto;
beforeEach(() =>
  vi.stubGlobal('crypto', {
    randomUUID: () => nativeCrypto.randomUUID(),
    getRandomValues: (a: Uint32Array) => {
      a.fill(1);
      return a;
    },
  }),
);
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const c = createCampaign('Undo tests');
  const a = createCharacter(CORE_RULES, 'Landon'),
    b = createCharacter(CORE_RULES, 'Cynere');
  a.skills = { fight: 4, physique: 3 };
  b.skills = { fight: 3, physique: 3 };
  a.aspects[0].name = 'Warrior';
  b.aspects[0].name = 'Thief';
  c.characters = [a, b];
  c.play.conflictId = 'fight';
  c.play.exchange = 1;
  return { c, a, b };
}
const roll = (
  c: Campaign,
  characterId = c.characters[0].id,
  action: 'overcome' | 'attack' | 'advantage' | 'defend' = 'overcome',
  opposition = 2,
  targetCharacterId?: string,
) => run(c, { type: 'roll', characterId, skillId: 'fight', action, opposition, targetCharacterId });
const undo = (c: Campaign, rollId = activeRolls(c)[0].id) =>
  run(c, { type: 'undoRoll', rollId, reason: 'Accidental roll' });

describe('GM roll undo', () => {
  it('restores an accidental action, retains history and deduplication, and prevents reuse', () => {
    const { c, a } = setup();
    const command: GameCommand = {
      type: 'roll',
      id: id(),
      characterId: a.id,
      action: 'overcome',
      skillId: 'fight',
      opposition: 2,
    };
    const rolled = applyCommand(c, command, gm),
      rollId = activeRolls(rolled)[0].id;
    expect(rolled.play.actedIds).toEqual([a.id]);
    const undone = undo(rolled);
    expect(undone.play.actedIds).toEqual([]);
    expect(activeRolls(undone)).toEqual([]);
    expect(undone.events).toHaveLength(2);
    expect(latestRoll(undone, rollId).undone).toBe(true);
    expect(applyCommand(undone, command, gm)).toBe(undone);
    expect(() => undo(undone, rollId)).toThrow(/already been undone/);
    expect(() => run(undone, { type: 'finalizeRoll', rollId })).toThrow(/finalized/);
    expect(() =>
      run(undone, { type: 'invoke', rollId, aspectId: a.aspects[0].id, free: false, mode: 'bonus' }),
    ).toThrow(/finalized/);
    expect(activeRolls(roll(undone))).toHaveLength(1);
    expect(c.events).toHaveLength(0);
  });
  it('rejects a player undo and an empty reason atomically', () => {
    const { c, a } = setup(),
      rolled = roll(c),
      before = structuredClone(rolled);
    expect(() =>
      run(
        rolled,
        { type: 'undoRoll', rollId: activeRolls(rolled)[0].id, reason: 'Mistake' },
        { id: 'p', role: 'player', characterIds: [a.id] },
      ),
    ).toThrow(/game master/);
    expect(() => run(rolled, { type: 'undoRoll', rollId: activeRolls(rolled)[0].id, reason: ' ' })).toThrow(
      /Explain/,
    );
    expect(rolled).toEqual(before);
  });
  it('refunds paid invocations, reverses hostile awards and preserves unrelated awards', () => {
    const { c, a, b } = setup();
    let next = roll(c);
    const rollId = activeRolls(next)[0].id;
    next = run(next, {
      type: 'invoke',
      rollId,
      aspectId: b.aspects[0].id,
      free: false,
      mode: 'bonus',
      hostile: true,
    });
    next = run(next, { type: 'adjustFate', characterId: a.id, amount: 2, reason: 'Unrelated reward' });
    expect(next.play.pendingAwards).toHaveLength(1);
    next = undo(next);
    expect(next.characters[0].fatePoints).toBe(a.fatePoints + 2);
    expect(next.play.pendingAwards).toHaveLength(0);
  });
  it('restores consumed boosts and removes an unused finalized advantage after a saved reload', () => {
    const { c, a } = setup();
    const boost = createAspect('boost', 'Opening');
    boost.freeInvokes = 1;
    c.play.aspects.push(boost);
    let next = roll(c, a.id, 'advantage', 0);
    const rollId = activeRolls(next)[0].id;
    next = run(next, { type: 'invoke', rollId, aspectId: boost.id, free: true, mode: 'bonus' });
    next = run(next, { type: 'finalizeRoll', rollId, aspectName: 'Outflanked' });
    expect(next.play.aspects.map((x) => x.name)).toEqual(['Outflanked']);
    next = campaignSchema.parse(JSON.parse(JSON.stringify(next)));
    next = undo(next);
    expect(next.play.aspects).toEqual([boost]);
    expect(next.characters[0].revision).toBeGreaterThan(a.revision);
  });
  it('blocks undo of an advantage used by another roll, then permits reversing in dependency order', () => {
    const { c, a, b } = setup();
    let next = roll(c, a.id, 'advantage', 0);
    const first = activeRolls(next)[0].id;
    next = run(next, { type: 'finalizeRoll', rollId: first, aspectName: 'Outflanked' });
    next = roll(next, b.id);
    const second = activeRolls(next)[1].id;
    next = run(next, {
      type: 'invoke',
      rollId: second,
      aspectId: next.play.aspects[0].id,
      free: true,
      mode: 'bonus',
    });
    const before = structuredClone(next);
    expect(() => undo(next, first)).toThrow(/since changed or been used/);
    expect(next).toEqual(before);
    next = undo(undo(next, second), first);
    expect(next.play.aspects).toEqual([]);
    expect(next.play.actedIds).toEqual([]);
  });
  it('reverses linked stress, consequences and consequence aspects, preserving another stress box', () => {
    const { c, a, b } = setup();
    let next = roll(c, a.id, 'attack', 0, b.id);
    const rollId = activeRolls(next)[0].id;
    next = run(next, { type: 'finalizeRoll', rollId });
    next = run(next, {
      type: 'harm',
      characterId: b.id,
      sourceRollId: rollId,
      sourceCharacterId: a.id,
      trackId: 'physical',
      shifts: 4,
      stressBox: 2,
      consequences: [{ value: 2, name: 'Bruised' }],
    });
    next.characters[1].stress.physical.push(1);
    next = undo(next);
    expect(next.characters[1].stress.physical).toEqual([1]);
    expect(next.characters[1].consequences).toEqual([]);
    expect(next.characters[1].aspects).toEqual(b.aspects);
    expect(() =>
      run(next, {
        type: 'harm',
        characterId: b.id,
        sourceRollId: rollId,
        trackId: 'physical',
        shifts: 4,
        stressBox: 4,
      }),
    ).toThrow();
  });
  it('restores taken-out state linked to an attack', () => {
    const { c, a, b } = setup();
    let next = roll(c, a.id, 'attack', 0, b.id);
    next = run(next, { type: 'takenOut', characterId: b.id, reason: 'Defeated' });
    expect(next.characters[1].takenOut).toBe(true);
    expect(undo(next).characters[1].takenOut).toBe(false);
  });
  it('does not silently remove harm that has already contributed to a concession', () => {
    const { c, a, b } = setup();
    let next = roll(c, a.id, 'attack', 0, b.id);
    const rollId = activeRolls(next)[0].id;
    next = run(next, { type: 'finalizeRoll', rollId });
    next = run(next, {
      type: 'harm',
      characterId: b.id,
      sourceRollId: rollId,
      trackId: 'physical',
      shifts: 4,
      stressBox: 2,
      consequences: [{ value: 2, name: 'Bruised' }],
    });
    next = run(next, { type: 'concede', characterId: b.id, reason: 'Retreat' });
    const before = structuredClone(next);
    expect(() => undo(next)).toThrow(/conceded/);
    expect(next).toEqual(before);
  });
  it('refunds a paid NPC reroll to the shared pool without changing unrelated later spending', () => {
    const { c, a } = setup();
    a.kind = 'main';
    c.play.npcFatePoints = 5;
    let next = roll(c);
    const rollId = activeRolls(next)[0].id;
    next = run(next, { type: 'invoke', rollId, aspectId: a.aspects[0].id, free: false, mode: 'reroll' });
    next.play.npcFatePoints--;
    expect(undo(next).play.npcFatePoints).toBe(4);
  });
  it('restores existing advantage ownership and free invokes', () => {
    const { c, a, b } = setup();
    const aspect = createAspect('situation', 'Mist');
    aspect.freeInvokes = 1;
    aspect.freeInvokeOwnerId = b.id;
    c.play.aspects.push(aspect);
    let next = run(c, {
      type: 'roll',
      characterId: a.id,
      action: 'advantage',
      skillId: 'fight',
      opposition: 0,
      advantageExisting: true,
    });
    next = run(next, { type: 'finalizeRoll', rollId: activeRolls(next)[0].id, existingAspectId: aspect.id });
    expect(next.play.aspects[0].freeInvokeOwnerId).toBe(a.id);
    expect(undo(next).play.aspects).toEqual([aspect]);
  });
  it('makes repeated delivery of the same undo command idempotent', () => {
    const { c } = setup();
    const next = roll(c);
    const command: GameCommand = {
      id: id(),
      type: 'undoRoll',
      rollId: activeRolls(next)[0].id,
      reason: 'Mistake',
    };
    const undone = applyCommand(next, command, gm);
    expect(applyCommand(undone, command, gm)).toBe(undone);
  });
  it('allows reversing earlier harm after undoing a later attack that took out its target', () => {
    const { c, a, b } = setup();
    let next = roll(c, a.id, 'attack', 2, b.id);
    const first = activeRolls(next)[0].id;
    next = run(next, { type: 'finalizeRoll', rollId: first });
    next = run(next, {
      type: 'harm',
      characterId: b.id,
      sourceRollId: first,
      trackId: 'physical',
      shifts: 2,
      stressBox: 2,
    });
    next = run(next, { type: 'nextExchange' });
    next = roll(next, a.id, 'attack', 0, b.id);
    const second = activeRolls(next)[1].id;
    next = run(next, { type: 'takenOut', characterId: b.id, reason: 'Defeated' });
    expect(() => undo(next, first)).toThrow(/taken out/);
    next = undo(undo(next, second), first);
    expect(next.characters[1].stress.physical).toEqual([]);
    expect(next.characters[1].takenOut).toBe(false);
  });
  it('does not return an action from a later exchange', () => {
    const { c, a } = setup();
    let next = roll(c);
    const first = activeRolls(next)[0].id;
    next = run(next, { type: 'finalizeRoll', rollId: first });
    next = run(next, { type: 'nextExchange' });
    next = roll(next);
    expect(undo(next, first).play.actedIds).toEqual([a.id]);
  });
  it('blocks undo across boundaries and supports untouched legacy rolls only', () => {
    const { c } = setup();
    let next = roll(c);
    delete next.events[0].undoChanges;
    delete next.events[0].roll!.exchange;
    expect(undo(next).play.actedIds).toEqual([]);
    next = run(next, { type: 'finalizeRoll', rollId: activeRolls(next)[0].id });
    expect(() => undo(next)).toThrow(/older roll/);
    next = run(next, { type: 'boundary', boundary: 'conflict', phase: 'end' });
    expect(() => undo(next)).toThrow(/boundary/);
  });
  it('strips private undo history and publishes cancellation even after a private invocation', () => {
    const { c, a } = setup();
    const secret = createAspect('game', 'Secret');
    secret.visibility = 'gm';
    c.issues.push(secret);
    let next = roll(c);
    next = run(next, {
      type: 'invoke',
      rollId: activeRolls(next)[0].id,
      aspectId: secret.id,
      free: false,
      mode: 'bonus',
    });
    const shared = projectCampaign(next);
    expect(shared.events.every((e) => !e.undoChanges)).toBe(true);
    expect(JSON.stringify(shared)).not.toContain('Secret');
    next = undo(next);
    expect(activeRolls(projectCampaign(next))).toHaveLength(0);
    expect(next.characters[0].fatePoints).toBe(a.fatePoints);
  });
});

it('uses live player ownership for controls and human labels, with no default to another character', () => {
  const { c, a, b } = setup();
  const actor: Actor = { id: 'nick', role: 'player', characterIds: [b.id] };
  b.ownerId = actor.id;
  c.members.push({ ...actor, name: 'Nick' });
  expect(controlledCharacters(c, true, actor).map((x) => x.id)).toEqual([b.id]);
  expect(controlledCharacters(c, true)).toEqual([]);
  expect(playerName(c, b)).toBe('Nick');
  expect(playerName(c, a)).toBeUndefined();
  b.ownerId = 'someone-else';
  expect(controlledCharacters(c, true, actor)).toEqual([]);
  expect(playerName(c, b)).toBeUndefined();
});
