import { describe, expect, it } from 'vitest';
import { CORE_RULES, createCharacter } from './defaults';
import {
  applyMilestoneChoice,
  deriveCharacter,
  initiative,
  resolveAction,
  resolveMobHit,
  rollDice,
  supportedColumns,
  teamworkBonus,
  validateCharacter,
  validateHarm,
} from './rules';
import type { Action, Stunt } from './types';

const stunt = (name = 'Trick'): Stunt => ({
  id: name,
  name,
  description: '+2 when the table agrees the condition applies.',
  refreshCost: 1,
  fateCost: 0,
  limit: 'none',
  uses: 0,
  maxUses: 1,
});

describe('Core SRD: Character Creation', () => {
  it('has the repository CC-BY source defaults, including three free stunts', () => {
    expect(CORE_RULES.freeStunts).toBe(3);
    expect(CORE_RULES.refresh).toBe(3);
    expect(CORE_RULES.skillSlots).toEqual({ '4': 1, '3': 2, '2': 3, '1': 4 });
    const c = createCharacter();
    expect(c.aspects).toHaveLength(5);
    expect(c.phases).toHaveLength(3);
  });
  it.each([
    [0, 3],
    [1, 3],
    [3, 3],
    [4, 2],
    [5, 1],
    [6, 0],
  ])('%i stunts produce refresh %i', (count, refresh) => {
    const c = createCharacter();
    c.stunts = Array.from({ length: count }, (_, i) => stunt(String(i)));
    expect(deriveCharacter(c, CORE_RULES).refresh).toBe(refresh);
    expect(validateCharacter(c, CORE_RULES).some((v) => v.field === 'stunts' && v.severity === 'error')).toBe(
      refresh < 1,
    );
  });
  it.each([
    [0, [1, 2], false],
    [1, [1, 2, 3], false],
    [2, [1, 2, 3], false],
    [3, [1, 2, 3, 4], false],
    [4, [1, 2, 3, 4], false],
    [5, [1, 2, 3, 4], true],
  ])('Physique %i derives the correct boxes and restricted consequence', (rank, boxes, bonus) => {
    const c = createCharacter();
    c.skills.physique = rank as number;
    const derived = deriveCharacter(c, CORE_RULES);
    expect(derived.tracks[0].boxes).toEqual(boxes);
    expect(derived.tracks[0].bonusMild).toBe(bonus);
    expect(derived.consequenceSlots.filter((s) => s.trackId === 'physical')).toHaveLength(bonus ? 1 : 0);
    expect(derived.tracks[1].boxes).toEqual([1, 2]);
  });
  it('applies configured stress skills without mutating the preset', () => {
    const rules = structuredClone(CORE_RULES);
    rules.stressTracks[0].skillId = 'resources';
    const c = createCharacter(rules);
    c.skills.resources = 3;
    expect(deriveCharacter(c, rules).tracks[0].boxes).toEqual([1, 2, 3, 4]);
    expect(CORE_RULES.stressTracks[0].skillId).toBe('physique');
  });
  it('allows intentional quick-start gaps but rejects overspent slots', () => {
    const c = createCharacter();
    c.creationMode = 'quick';
    c.status = 'ready';
    c.aspects[0].name = 'Wandering sailor';
    c.skills.athletics = 4;
    expect(validateCharacter(c, CORE_RULES).filter((i) => i.severity === 'error')).toEqual([]);
    c.skills.fight = 4;
    expect(validateCharacter(c, CORE_RULES).some((i) => i.message.includes('Only 1'))).toBe(true);
  });
  it('reports unknown skills, fractional ratings and invalid marked boxes', () => {
    const c = createCharacter();
    c.skills.unknown = 1.5;
    c.stress.physical = [5];
    const errors = validateCharacter(c, CORE_RULES).filter((i) => i.severity === 'error');
    expect(errors.some((i) => i.message.includes('Unknown'))).toBe(true);
    expect(errors.some((i) => i.message.includes('whole'))).toBe(true);
    expect(errors.some((i) => i.field === 'stress')).toBe(true);
  });
  it('does not count ordinary consequence aspects against creation aspects', () => {
    const c = createCharacter();
    c.creationMode = 'quick';
    c.aspects[0].name = 'Hero';
    c.skills.fight = 4;
    c.aspects.push({
      id: 'wound',
      name: 'Wounded',
      kind: 'consequence',
      ownerId: c.id,
      freeInvokes: 1,
      visibility: 'shared',
    });
    expect(validateCharacter(c, CORE_RULES).some((v) => v.message.includes('Complete 5'))).toBe(false);
  });
  it.each([
    {
      name: 'Harbor guard (companion fixture)',
      skills: {
        fight: 4,
        notice: 3,
        physique: 3,
        athletics: 2,
        shoot: 2,
        will: 2,
        crafts: 1,
        contacts: 1,
        deceive: 1,
        stealth: 1,
      },
      stunts: 3,
      refresh: 3,
      physical: 4,
      mental: 3,
    },
    {
      name: 'Coastal courier (companion fixture)',
      skills: {
        athletics: 4,
        notice: 3,
        stealth: 3,
        contacts: 2,
        rapport: 2,
        physique: 2,
        resources: 1,
        crafts: 1,
        burglary: 1,
        empathy: 1,
      },
      stunts: 3,
      refresh: 3,
      physical: 3,
      mental: 2,
    },
    {
      name: 'Archivist (companion fixture)',
      skills: {
        lore: 4,
        will: 3,
        crafts: 3,
        notice: 2,
        empathy: 2,
        investigate: 2,
        athletics: 1,
        resources: 1,
        contacts: 1,
        rapport: 1,
      },
      stunts: 4,
      refresh: 2,
      physical: 2,
      mental: 4,
    },
  ])('derives SRD capacities for an independently authored pyramid: $name', (example) => {
    const c = createCharacter(CORE_RULES, example.name);
    c.skills = Object.fromEntries(
      Object.entries(example.skills).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number',
      ),
    );
    c.stunts = Array.from({ length: example.stunts }, (_, i) => stunt(String(i)));
    const d = deriveCharacter(c, CORE_RULES);
    expect(d.refresh).toBe(example.refresh);
    expect(d.tracks[0].boxes).toHaveLength(example.physical);
    expect(d.tracks[1].boxes).toHaveLength(example.mental);
    expect(validateCharacter(c, CORE_RULES).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('Core SRD: Rolling the Dice and Actions and Outcomes', () => {
  it('enumerates all 81 combinations with the expected symmetrical distribution', () => {
    const counts = Array(9).fill(0);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let c = -1; c <= 1; c++) for (let d = -1; d <= 1; d++) counts[a + b + c + d + 4]++;
    expect(counts).toEqual([1, 4, 10, 16, 19, 16, 10, 4, 1]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(81);
  });
  it('rejects the excess random-byte value instead of biasing dice', () => {
    let call = 0;
    const dice = rollDice((bytes) => {
      bytes.set(call++ === 0 ? [255, 0, 1, 2] : [3, 4, 5, 6]);
      return bytes;
    });
    expect(dice).toEqual([-1, 0, 1, -1]);
    expect(call).toBe(2);
  });
  it.each(['overcome', 'advantage', 'attack', 'defend'] as Action[])(
    'implements all four result boundaries for %s',
    (action) => {
      expect(resolveAction(action, 2, 3).outcome).toBe('failure');
      expect(resolveAction(action, 3, 3).outcome).toBe('tie');
      expect(resolveAction(action, 4, 3).outcome).toBe('success');
      expect(resolveAction(action, 5, 3).outcome).toBe('success');
      expect(resolveAction(action, 6, 3).outcome).toBe('style');
    },
  );
  it('distinguishes new and existing advantage ties', () => {
    expect(resolveAction('advantage', 2, 2)).toMatchObject({ boost: true, freeInvokes: 0 });
    expect(resolveAction('advantage', 2, 2, true)).toMatchObject({ boost: false, freeInvokes: 1 });
    expect(resolveAction('advantage', 5, 2)).toMatchObject({ boost: false, freeInvokes: 2 });
  });
  it('an attack tie creates a boost with zero harm; style offers the optional trade', () => {
    expect(resolveAction('attack', 2, 2)).toMatchObject({ boost: true, damage: 0 });
    expect(resolveAction('attack', 5, 2)).toMatchObject({ boost: false, damage: 3 });
  });
  it('rejects invalid totals instead of generating a misleading outcome', () => {
    expect(() => resolveAction('attack', NaN, 0)).toThrow();
  });
});

describe('Core SRD: Resolving Attacks, Consequences, and Extreme Consequences', () => {
  it('allows one available rated box plus consequences', () => {
    const c = createCharacter();
    expect(() => validateHarm(c, CORE_RULES, 'physical', 4, 2, [{ value: 2 }])).not.toThrow();
    expect(() => validateHarm(c, CORE_RULES, 'physical', 4, 2, [])).toThrow('entire hit');
    c.stress.physical = [2];
    expect(() => validateHarm(c, CORE_RULES, 'physical', 2, 2, [])).toThrow('available');
  });
  it('shares ordinary consequence slots across harm types', () => {
    const c = createCharacter();
    c.consequences.push({ id: 'wound', name: 'Bruised', value: 2, recovering: false });
    expect(() => validateHarm(c, CORE_RULES, 'mental', 2, undefined, [{ value: 2 }])).toThrow('occupied');
  });
  it('rejects duplicate slots and cross-track use of restricted consequences', () => {
    const c = createCharacter();
    c.skills.physique = 5;
    expect(() =>
      validateHarm(c, CORE_RULES, 'physical', 4, undefined, [
        { value: 2 },
        { value: 2, trackId: 'physical' },
      ]),
    ).not.toThrow();
    expect(() =>
      validateHarm(c, CORE_RULES, 'mental', 2, undefined, [{ value: 2, trackId: 'physical' }]),
    ).toThrow('Restricted');
    expect(() => validateHarm(c, CORE_RULES, 'physical', 4, undefined, [{ value: 2 }, { value: 2 }])).toThrow(
      'occupied',
    );
  });
  it('limits extreme consequences to once between major milestones', () => {
    const c = createCharacter();
    expect(() => validateHarm(c, CORE_RULES, 'physical', 8, undefined, [], true)).not.toThrow();
    c.extremeUsed = true;
    expect(() => validateHarm(c, CORE_RULES, 'physical', 8, undefined, [], true)).toThrow('major milestones');
  });
  it('cannot sneak an extreme consequence into an ordinary slot', () => {
    expect(() =>
      validateHarm(createCharacter(), CORE_RULES, 'physical', 8, undefined, [{ value: 8 }]),
    ).toThrow('unavailable');
  });
});

describe('NPCs, teamwork, and advancement', () => {
  it.each([
    [1, []],
    [2, [1]],
    [3, [1, 2]],
  ])('nameless NPC peak %i has a shared track and no consequences', (peak, boxes) => {
    const c = createCharacter(CORE_RULES, 'Guard', 'nameless');
    c.skills.fight = peak as number;
    const d = deriveCharacter(c, CORE_RULES);
    expect(d.tracks).toHaveLength(1);
    expect(d.tracks[0].boxes).toEqual(boxes);
    expect(d.consequenceSlots).toEqual([]);
  });
  it('supporting NPCs have mild, optionally moderate consequences', () => {
    const c = createCharacter(CORE_RULES, 'Lieutenant', 'supporting');
    expect(deriveCharacter(c, CORE_RULES).consequenceSlots).toEqual([{ value: 2 }]);
    c.npcTough = true;
    expect(deriveCharacter(c, CORE_RULES).consequenceSlots).toEqual([{ value: 2 }, { value: 4 }]);
  });
  it('uses Core initiative tie breakers, separately for mental conflict', () => {
    const a = createCharacter(CORE_RULES, 'A'),
      b = createCharacter(CORE_RULES, 'B');
    a.skills = { notice: 2, athletics: 1, empathy: 3 };
    b.skills = { notice: 2, athletics: 2, empathy: 1 };
    expect(initiative([a, b], 'physical')[0].id).toBe(b.id);
    expect(initiative([b, a], 'mental')[0].id).toBe(a.id);
  });
  it('requires distinct, qualified helpers', () => {
    const leader = createCharacter(),
      helper = createCharacter();
    helper.skills.fight = 1;
    expect(teamworkBonus(leader, [helper], 'fight')).toBe(1);
    expect(() => teamworkBonus(leader, [helper, helper], 'fight')).toThrow();
    expect(() => teamworkBonus(leader, [helper], 'lore')).toThrow();
  });
  it('allows supported columns after creation, not only the original pyramid', () => {
    expect(supportedColumns({ a: 1, b: 2, c: 3, d: 4 })).toBe(true);
    expect(supportedColumns({ a: 1, b: 2, c: 3, d: 3 })).toBe(false);
    expect(supportedColumns({ a: 2 })).toBe(false);
  });
  it('restricts replacing untrained skills and changing high concept', () => {
    const c = createCharacter();
    c.skills.fight = 4;
    expect(() =>
      applyMilestoneChoice(c, CORE_RULES, { kind: 'swapSkills', first: 'fight', second: 'lore' }),
    ).toThrow('Average');
    expect(() =>
      applyMilestoneChoice(c, CORE_RULES, {
        kind: 'renameAspect',
        aspectId: c.aspects[0].id,
        name: 'Changed hero',
      }),
    ).toThrow('major');
    expect(
      applyMilestoneChoice(
        c,
        CORE_RULES,
        { kind: 'renameAspect', aspectId: c.aspects[0].id, name: 'Changed hero' },
        true,
      ).aspects[0].name,
    ).toBe('Changed hero');
  });
  it('reproduces the repository SRD Hits and Overflow example', () => {
    const mob = Array.from({ length: 3 }, () => {
      const c = createCharacter(CORE_RULES, 'Thug', 'nameless');
      c.skills.fight = 1;
      return c;
    });
    const result = resolveMobHit(mob, CORE_RULES, 2);
    expect(result.takenOutIds).toHaveLength(2);
    expect(result.remainingShifts).toBe(0);
    expect(mob.every((c) => !c.takenOut)).toBe(true);
  });
  it('uses a nameless member’s rated stress before applying overflow', () => {
    const fair = createCharacter(CORE_RULES, 'Guard', 'nameless');
    fair.skills.fight = 2;
    const average = createCharacter(CORE_RULES, 'Thug', 'nameless');
    average.skills.fight = 1;
    expect(resolveMobHit([fair, average], CORE_RULES, 1).characters[0].stress.physical).toEqual([1]);
    expect(resolveMobHit([fair, average], CORE_RULES, 3).takenOutIds).toHaveLength(2);
  });
});
