import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeRolls, applyCommand, latestRoll } from './commands';
import type { GameCommand } from './commands';
import { CORE_RULES, createAspect, createCampaign, createCharacter, id } from './defaults';
import type { Actor, Campaign } from './types';

const gm: Actor = { id: 'gm', role: 'gm', characterIds: [] };
function fixture() {
  const campaign = createCampaign('Regression campaign');
  const a = createCharacter(CORE_RULES, 'Landon'),
    b = createCharacter(CORE_RULES, 'Cynere');
  a.skills = { fight: 4, physique: 3, athletics: 2, notice: 1 };
  b.skills = { fight: 3, will: 2 };
  a.aspects[0].name = 'Warrior of the wilds';
  b.aspects[0].name = 'Infamous thief';
  campaign.characters = [a, b];
  return { campaign, a, b, player: { id: 'player', role: 'player', characterIds: [a.id] } as Actor };
}
function run(c: Campaign, command: Omit<GameCommand, 'id'>, actor = gm) {
  return applyCommand(c, { ...command, id: id() } as GameCommand, actor);
}

const nativeCrypto = globalThis.crypto;
beforeEach(() =>
  vi.stubGlobal('crypto', {
    randomUUID: () => nativeCrypto.randomUUID(),
    getRandomValues: vi.fn((array: any) => {
      array.fill(1);
      return array;
    }),
  }),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Atomic commands and authorization', () => {
  it('persists accepted identifiers and makes retries exactly-once', () => {
    const { campaign, a } = fixture();
    const command: GameCommand = {
      id: 'one',
      type: 'adjustFate',
      characterId: a.id,
      amount: 1,
      reason: 'Reward',
    };
    const next = applyCommand(campaign, command, gm);
    expect(next.characters[0].fatePoints).toBe(4);
    expect(applyCommand(structuredClone(next), command, gm)).toEqual(next);
    expect(next.events).toHaveLength(1);
    expect(campaign.characters[0].fatePoints).toBe(3);
  });
  it('rejects stale revisions without changing the original', () => {
    const { campaign, a } = fixture();
    expect(() =>
      applyCommand(
        campaign,
        { id: id(), expectedRevision: 5, type: 'adjustFate', characterId: a.id, amount: 1, reason: 'Reward' },
        gm,
      ),
    ).toThrow('changed');
    expect(campaign.events).toEqual([]);
  });
  it('rejects player use of GM controls and another character', () => {
    const { campaign, a, b, player } = fixture();
    expect(() =>
      run(campaign, { type: 'adjustFate', characterId: a.id, amount: 1, reason: 'Cheat' } as any, player),
    ).toThrow('game master');
    expect(() =>
      run(
        campaign,
        { type: 'roll', characterId: b.id, action: 'attack', skillId: 'fight', opposition: 0 } as any,
        player,
      ),
    ).toThrow('control');
  });
  it('requires a review when a narrative draft is stale', () => {
    const { campaign, a, player } = fixture();
    expect(() =>
      run(campaign, {
        type: 'applyDraft',
        characterId: a.id,
        baseRevision: 2,
        changes: { notes: 'Draft' },
      } as any),
    ).toThrow('changed');
    expect(() =>
      run(
        campaign,
        { type: 'applyDraft', characterId: a.id, baseRevision: 0, changes: { notes: 'Draft' } } as any,
        player,
      ),
    ).toThrow('game master');
    const next = run(campaign, {
      type: 'applyDraft',
      characterId: a.id,
      baseRevision: 0,
      changes: { notes: 'Draft' },
    } as any);
    expect(next.characters[0].notes).toBe('Draft');
    expect(next.characters[0].revision).toBe(1);
    expect(() =>
      run(campaign, {
        type: 'applyDraft',
        characterId: a.id,
        baseRevision: 0,
        changes: { fatePoints: 99 },
      } as any),
    ).toThrow('narrative');
  });
  it('ownership assignment transfers a shared PC without retaining stale grants', () => {
    const { campaign, a } = fixture();
    let c = run(campaign, {
      type: 'assignPlayer',
      memberId: 'first',
      name: 'First player',
      characterIds: [a.id],
    } as any);
    c = run(c, {
      type: 'assignPlayer',
      memberId: 'second',
      name: 'Second player',
      characterIds: [a.id],
    } as any);
    expect(c.characters[0].ownerId).toBe('second');
    expect(c.members.find((m) => m.id === 'first')!.characterIds).toEqual([]);
    expect(c.characters[0].revision).toBe(2);
  });
  it('player map moves require visible owned tokens and normalized positions', () => {
    const { campaign, a, player } = fixture();
    campaign.maps.push({
      id: 'map',
      name: 'City',
      visibility: 'shared',
      currentRevisionId: 'rev',
      sharedRevisionId: 'rev',
      revisions: [
        {
          id: 'rev',
          assetId: 'asset',
          createdAt: '',
          zones: [
            { id: 'zone', name: 'Square', x: 0, y: 0, width: 1, height: 1, aspect: '', connections: [] },
          ],
          annotations: [],
          tokens: [{ id: 'token', characterId: a.id, label: a.name, x: 0.1, y: 0.1, visibility: 'shared' }],
        },
      ],
    });
    const command = {
      type: 'moveToken',
      mapId: 'map',
      revisionId: 'rev',
      tokenId: 'token',
      x: 0.5,
      y: 0.6,
      zoneId: 'zone',
    } as any;
    const c = run(campaign, command, player);
    expect(c.maps[0].revisions[0].tokens[0].x).toBe(0.5);
    expect(() => run(campaign, { ...command, x: 2 }, player)).toThrow('normalized');
    expect(() => run(campaign, command, { ...player, characterIds: [] })).toThrow('own visible');
    campaign.maps[0].visibility = 'gm';
    expect(() => run(campaign, command, player)).toThrow('own visible');
  });
});

describe('Core SRD: Invoking Aspects, Free Invocations, and The Four Actions', () => {
  it('rejects guessed IDs of aspects inside hidden character containers', () => {
    const { campaign, a, b, player } = fixture();
    campaign.characters[1].visibility = 'gm';
    let c = run(
      campaign,
      {
        type: 'roll',
        characterId: a.id,
        action: 'advantage',
        skillId: 'fight',
        opposition: 4,
        advantageExisting: true,
      } as any,
      player,
    );
    const rollId = c.events.at(-1)!.roll!.id;
    expect(() =>
      run(
        c,
        { type: 'invoke', rollId, aspectId: b.aspects[0].id, free: false, mode: 'bonus' } as any,
        player,
      ),
    ).toThrow('unavailable');
    expect(() =>
      run(c, { type: 'finalizeRoll', rollId, existingAspectId: b.aspects[0].id } as any, player),
    ).toThrow('unavailable');
    expect(c.characters[0].fatePoints).toBe(3);
  });
  it('records reproducible dice/modifier arithmetic without mutating the old log', () => {
    const { campaign, a, player } = fixture();
    const next = run(
      campaign,
      {
        type: 'roll',
        characterId: a.id,
        action: 'overcome',
        skillId: 'fight',
        opposition: 3,
        modifier: 1,
      } as any,
      player,
    );
    expect(next.events[0].roll).toMatchObject({
      dice: [0, 0, 0, 0],
      skill: 4,
      modifier: 1,
      total: 5,
      shifts: 2,
      outcome: 'success',
    });
    expect(campaign.events).toHaveLength(0);
  });
  it('allows free stacking plus one paid invocation per aspect', () => {
    const { campaign, a } = fixture();
    campaign.characters[0].aspects[0].freeInvokes = 2;
    let c = run(campaign, {
      type: 'roll',
      characterId: a.id,
      action: 'overcome',
      skillId: 'fight',
      opposition: 5,
    } as any);
    const rollId = c.events[0].roll!.id;
    for (const free of [true, true, false])
      c = run(c, { type: 'invoke', rollId, aspectId: a.aspects[0].id, free, mode: 'bonus' } as any);
    expect(latestRoll(c, rollId).total).toBe(10);
    expect(c.characters[0].fatePoints).toBe(2);
    expect(c.characters[0].aspects[0].freeInvokes).toBe(0);
    expect(c.events[0].roll!.total).toBe(4);
    expect(() =>
      run(c, { type: 'invoke', rollId, aspectId: a.aspects[0].id, free: false, mode: 'bonus' } as any),
    ).toThrow('one paid');
  });
  it('rerolls all four dice and preserves separate +2 invocations', () => {
    const { campaign, a } = fixture();
    const other = createAspect('situation', 'A clear path');
    campaign.play.aspects.push(other);
    let c = run(campaign, {
      type: 'roll',
      characterId: a.id,
      action: 'overcome',
      skillId: 'fight',
      opposition: 5,
    } as any);
    const rollId = c.events[0].roll!.id;
    c = run(c, { type: 'invoke', rollId, aspectId: other.id, free: false, mode: 'bonus' } as any);
    vi.mocked(crypto.getRandomValues).mockImplementation((array: any) => {
      array.fill(2);
      return array;
    });
    c = run(c, { type: 'invoke', rollId, aspectId: a.aspects[0].id, free: false, mode: 'reroll' } as any);
    expect(latestRoll(c, rollId)).toMatchObject({ dice: [1, 1, 1, 1], total: 10 });
  });
  it('pays hostile invocations after the scene, never for free invocations', () => {
    const { campaign, a, b } = fixture();
    campaign.characters[1].aspects[0].freeInvokes = 1;
    let c = run(campaign, {
      type: 'roll',
      characterId: a.id,
      action: 'attack',
      skillId: 'fight',
      opposition: 3,
    } as any);
    const rollId = c.events[0].roll!.id;
    c = run(c, { type: 'invoke', rollId, aspectId: b.aspects[0].id, free: true, mode: 'bonus' } as any);
    expect(c.play.pendingAwards).toHaveLength(0);
    c = run(c, {
      type: 'invoke',
      rollId,
      aspectId: b.aspects[0].id,
      free: false,
      mode: 'bonus',
      hostile: true,
    } as any);
    expect(c.characters[1].fatePoints).toBe(3);
    expect(c.play.pendingAwards).toHaveLength(1);
    c = run(c, { type: 'boundary', boundary: 'scene', phase: 'end' } as any);
    expect(c.characters[1].fatePoints).toBe(4);
    expect(c.play.pendingAwards).toEqual([]);
  });
  it('consumes boosts but keeps enduring aspects when their free invokes run out', () => {
    const { campaign, a } = fixture();
    const boost = createAspect('boost', 'Opening');
    boost.freeInvokes = 1;
    campaign.play.aspects.push(boost);
    let c = run(campaign, {
      type: 'roll',
      characterId: a.id,
      action: 'overcome',
      skillId: 'fight',
      opposition: 4,
    } as any);
    c = run(c, {
      type: 'invoke',
      rollId: c.events[0].roll!.id,
      aspectId: boost.id,
      free: true,
      mode: 'bonus',
    } as any);
    expect(c.play.aspects).toEqual([]);
    expect(c.characters[0].aspects).toHaveLength(5);
  });
  it('cannot buy a paid boost use or add lasting invocations to a boost', () => {
    const { campaign, a } = fixture();
    const boost = createAspect('boost', 'Opening');
    boost.freeInvokes = 1;
    campaign.play.aspects.push(boost);
    let c = run(campaign, {
      type: 'roll',
      characterId: a.id,
      action: 'advantage',
      skillId: 'fight',
      opposition: 4,
      advantageExisting: true,
    } as any);
    const rollId = c.events.at(-1)!.roll!.id;
    expect(() =>
      run(c, { type: 'invoke', rollId, aspectId: boost.id, free: false, mode: 'bonus' } as any),
    ).toThrow('only be invoked for free');
    expect(() => run(c, { type: 'finalizeRoll', rollId, existingAspectId: boost.id } as any)).toThrow(
      'not an enduring aspect',
    );
    expect(c.characters[0].fatePoints).toBe(3);
  });
  it('keeps private rolls private through invocations and finalization', () => {
    const { campaign, a } = fixture();
    let c = run(campaign, {
      type: 'roll',
      characterId: a.id,
      action: 'overcome',
      skillId: 'fight',
      opposition: 4,
      visibility: 'gm',
    } as any);
    const rollId = c.events[0].roll!.id;
    c = run(c, { type: 'invoke', rollId, aspectId: a.aspects[0].id, free: false, mode: 'bonus' } as any);
    c = run(c, { type: 'finalizeRoll', rollId } as any);
    expect(c.events.every((e) => e.visibility === 'gm')).toBe(true);
  });
  it('creates exactly one boost for a new-advantage tie', () => {
    const { campaign, a } = fixture();
    let c = run(campaign, {
      type: 'roll',
      characterId: a.id,
      action: 'advantage',
      skillId: 'fight',
      opposition: 4,
    } as any);
    const rollId = c.events[0].roll!.id;
    c = run(c, { type: 'finalizeRoll', rollId, aspectName: 'Off balance' } as any);
    expect(c.play.aspects).toHaveLength(1);
    expect(c.play.aspects[0]).toMatchObject({ kind: 'boost', freeInvokes: 1, name: 'Off balance' });
    expect(() => run(c, { type: 'finalizeRoll', rollId } as any)).toThrow('already');
  });
  it('gives an existing advantage a free invoke on a tie without creating a boost', () => {
    const { campaign, a } = fixture();
    const aspect = createAspect('situation', 'Smoke');
    campaign.play.aspects.push(aspect);
    let c = run(campaign, {
      type: 'roll',
      characterId: a.id,
      action: 'advantage',
      skillId: 'fight',
      opposition: 4,
      advantageExisting: true,
    } as any);
    c = run(c, { type: 'finalizeRoll', rollId: c.events[0].roll!.id, existingAspectId: aspect.id } as any);
    expect(c.play.aspects).toHaveLength(1);
    expect(c.play.aspects[0]).toMatchObject({ kind: 'situation', freeInvokes: 1 });
  });
});

describe('Core SRD: The Fate Point Economy and Conflicts', () => {
  it('tops up a session, resets a scenario, and never clears mid-conflict stress', () => {
    const { campaign } = fixture();
    campaign.characters[0].fatePoints = 7;
    campaign.characters[1].fatePoints = 1;
    campaign.characters[0].stress.physical = [2];
    let c = run(campaign, { type: 'boundary', boundary: 'conflict', phase: 'start' } as any);
    c = run(c, { type: 'boundary', boundary: 'session', phase: 'end' } as any);
    c = run(c, { type: 'boundary', boundary: 'session', phase: 'start' } as any);
    expect(c.characters.map((p) => p.fatePoints)).toEqual([7, 3]);
    expect(c.characters[0].stress.physical).toEqual([2]);
    c = run(c, { type: 'boundary', boundary: 'scenario', phase: 'start' } as any);
    expect(c.characters.map((p) => p.fatePoints)).toEqual([3, 3]);
  });
  it('clears stress only after a confirmed breather, not consequences', () => {
    const { campaign, a } = fixture();
    let c = run(campaign, { type: 'boundary', boundary: 'conflict', phase: 'start' } as any);
    c = run(c, {
      type: 'harm',
      characterId: a.id,
      trackId: 'physical',
      shifts: 4,
      stressBox: 2,
      consequences: [{ value: 2, name: 'Bruised ribs' }],
    } as any);
    c = run(c, { type: 'boundary', boundary: 'conflict', phase: 'end', breather: true } as any);
    expect(c.characters[0].stress.physical).toEqual([]);
    expect(c.characters[0].consequences).toHaveLength(1);
  });
  it('can end a conflict without a breather, then recover stress later', () => {
    const { campaign } = fixture();
    campaign.characters[0].stress.physical = [2];
    let c = run(campaign, { type: 'boundary', boundary: 'conflict', phase: 'start' } as any);
    expect(() => run(c, { type: 'breather' } as any)).toThrow('ended');
    c = run(c, { type: 'boundary', boundary: 'conflict', phase: 'end', breather: false } as any);
    expect(c.characters[0].stress.physical).toEqual([2]);
    c = run(c, { type: 'breather' } as any);
    expect(c.characters[0].stress.physical).toEqual([]);
  });
  it('uses a limited NPC pool and permits GM awards independently', () => {
    const { campaign, a } = fixture();
    const npc = createCharacter(CORE_RULES, 'Rival', 'main');
    campaign.characters.push(npc);
    let c = run(campaign, {
      type: 'boundary',
      boundary: 'scene',
      phase: 'start',
      participantIds: [a.id],
    } as any);
    expect(c.play.npcFatePoints).toBe(1);
    c = run(c, { type: 'compel', characterId: a.id, accepted: true, reason: 'A difficult choice' } as any);
    expect(c.play.npcFatePoints).toBe(1);
    expect(c.characters[0].fatePoints).toBe(4);
    c = run(c, {
      type: 'compel',
      characterId: npc.id,
      accepted: true,
      reason: 'The rival leaves',
      carryToNextScene: true,
    } as any);
    c = run(c, { type: 'boundary', boundary: 'scene', phase: 'start' } as any);
    expect(c.play.npcFatePoints).toBe(3);
    expect(c.play.npcCarryover).toBe(0);
  });
  it('resets only usage counters matching the boundary', () => {
    const { campaign } = fixture();
    campaign.characters[0].stunts = ['scene', 'session', 'conflict'].map((limit) => ({
      id: limit,
      name: limit,
      description: '',
      refreshCost: 1,
      fateCost: 0,
      limit: limit as any,
      uses: 1,
      maxUses: 1,
    }));
    const c = run(campaign, { type: 'boundary', boundary: 'scene', phase: 'start' } as any);
    expect(c.characters[0].stunts.map((s) => s.uses)).toEqual([0, 1, 1]);
  });
});

describe('Conflict state and recovery', () => {
  it('enforces one proactive action but permits repeated defenses', () => {
    const { campaign, a } = fixture();
    let c = run(campaign, { type: 'boundary', boundary: 'conflict', phase: 'start' } as any);
    c = run(c, {
      type: 'roll',
      characterId: a.id,
      action: 'overcome',
      skillId: 'fight',
      opposition: 0,
    } as any);
    expect(() =>
      run(c, { type: 'roll', characterId: a.id, action: 'attack', skillId: 'fight', opposition: 0 } as any),
    ).toThrow('already');
    for (let i = 0; i < 2; i++)
      c = run(c, {
        type: 'roll',
        characterId: a.id,
        action: 'defend',
        skillId: 'fight',
        opposition: 0,
      } as any);
    expect(activeRolls(c)).toHaveLength(3);
  });
  it('requires a pre-roll concession and delays its award until the conflict ends', () => {
    const { campaign, a } = fixture();
    let c = run(campaign, { type: 'boundary', boundary: 'conflict', phase: 'start' } as any);
    c = run(c, {
      type: 'harm',
      characterId: a.id,
      trackId: 'physical',
      shifts: 2,
      consequences: [{ value: 2, name: 'Wounded' }],
    } as any);
    c = run(c, { type: 'concede', characterId: a.id, reason: 'Captured, but alive' } as any);
    expect(c.characters[0].fatePoints).toBe(3);
    expect(() => run(c, { type: 'concede', characterId: a.id, reason: 'Again' } as any)).toThrow();
    c = run(c, { type: 'boundary', boundary: 'conflict', phase: 'end' } as any);
    expect(c.characters[0].fatePoints).toBe(5);
  });
  it('prevents conceding after attack dice even if the result has been finalized', () => {
    const { campaign, a, b } = fixture();
    let c = run(campaign, { type: 'boundary', boundary: 'conflict', phase: 'start' } as any);
    c = run(c, {
      type: 'roll',
      characterId: a.id,
      targetCharacterId: b.id,
      action: 'attack',
      skillId: 'fight',
      opposition: 2,
    } as any);
    const rollId = c.events.at(-1)!.roll!.id;
    expect(() => run(c, { type: 'concede', characterId: b.id, reason: 'Too late' } as any)).toThrow(
      'already been rolled',
    );
    c = run(c, { type: 'finalizeRoll', rollId } as any);
    expect(() => run(c, { type: 'concede', characterId: b.id, reason: 'Still too late' } as any)).toThrow(
      'already been rolled',
    );
    c = run(c, {
      type: 'harm',
      characterId: b.id,
      trackId: 'physical',
      shifts: 2,
      stressBox: 2,
      sourceRollId: rollId,
    } as any);
    expect(() =>
      run(c, { type: 'concede', characterId: b.id, reason: 'Before the next attack' } as any),
    ).not.toThrow();
  });
  it('requires treatment and a whole narrative period, not wall-clock passage', () => {
    const { campaign, a } = fixture();
    let c = run(campaign, {
      type: 'harm',
      characterId: a.id,
      trackId: 'mental',
      shifts: 4,
      consequences: [{ value: 4, name: 'Shaken' }],
    } as any);
    const consequenceId = c.characters[0].consequences[0].id;
    expect(() =>
      run(c, {
        type: 'recover',
        characterId: a.id,
        consequenceId,
        stage: 'clear',
        wholePeriodElapsed: true,
      } as any),
    ).toThrow('begin first');
    expect(() =>
      run(c, {
        type: 'recover',
        characterId: a.id,
        consequenceId,
        stage: 'start',
        recoveryTotal: 5,
        selfTreatment: true,
      } as any),
    ).toThrow('+6');
    c = run(c, {
      type: 'recover',
      characterId: a.id,
      consequenceId,
      stage: 'start',
      recoveryTotal: 4,
    } as any);
    expect(() =>
      run(c, { type: 'recover', characterId: a.id, consequenceId, stage: 'clear' } as any),
    ).toThrow('whole');
    c = run(c, {
      type: 'recover',
      characterId: a.id,
      consequenceId,
      stage: 'clear',
      wholePeriodElapsed: true,
    } as any);
    expect(c.characters[0].consequences).toEqual([]);
    expect(c.characters[0].aspects.some((a) => a.id === consequenceId)).toBe(false);
  });
});

describe('Milestones and persistent character growth', () => {
  it('grants lower-tier benefits with major milestones without replenishing current Fate points', () => {
    const { campaign, a } = fixture();
    let c = run(campaign, {
      type: 'milestone',
      characterId: a.id,
      milestone: 'major',
      description: 'The tyrant falls',
    } as any);
    expect(c.characters[0]).toMatchObject({ bankedSkillPoints: 1, refreshAdjustment: 1, fatePoints: 3 });
    c = run(c, { type: 'boundary', boundary: 'session', phase: 'start' } as any);
    expect(c.characters[0].fatePoints).toBe(4);
  });
  it('a minor milestone permits exactly one equivalence change', () => {
    const { campaign, a } = fixture();
    let c = run(campaign, {
      type: 'milestone',
      characterId: a.id,
      milestone: 'minor',
      description: 'New perspective',
    } as any);
    const milestoneId = c.characters[0].milestones[0].id;
    c = run(c, {
      type: 'milestoneChoice',
      characterId: a.id,
      milestoneId,
      choice: { kind: 'renameAspect', aspectId: a.aspects[1].id, name: 'Hunted by the crown' },
    } as any);
    expect(() =>
      run(c, {
        type: 'milestoneChoice',
        characterId: a.id,
        milestoneId,
        choice: { kind: 'renameAspect', aspectId: a.aspects[1].id, name: 'Changed again' },
      } as any),
    ).toThrow('no unspent');
  });
  it('banks skill points and prevents unsupported columns', () => {
    const { campaign, a } = fixture();
    let c = run(campaign, {
      type: 'milestone',
      characterId: a.id,
      milestone: 'significant',
      description: 'Victory',
    } as any);
    expect(() => run(c, { type: 'spendSkill', characterId: a.id, skillId: 'notice' } as any)).toThrow(
      'supporting',
    );
    c = run(c, { type: 'spendSkill', characterId: a.id, skillId: 'lore' } as any);
    expect(c.characters[0].skills.lore).toBe(1);
    expect(c.characters[0].bankedSkillPoints).toBe(0);
  });
  it('charges a paid stunt during quick creation now and reduces future refresh', () => {
    const { campaign, a } = fixture();
    const template = {
      name: 'Trick',
      description: 'A negotiated stunt',
      refreshCost: 1,
      fateCost: 0,
      limit: 'none' as const,
      uses: 0,
      maxUses: 1,
    };
    campaign.characters[0].creationMode = 'quick';
    campaign.characters[0].stunts = Array.from({ length: 3 }, () => ({ ...template, id: id() }));
    const c = run(campaign, {
      type: 'learnStunt',
      characterId: a.id,
      stunt: { ...template, id: id() },
    } as any);
    expect(c.characters[0].fatePoints).toBe(2);
    expect(c.characters[0].stunts).toHaveLength(4);
    campaign.characters[0].fatePoints = 0;
    expect(() =>
      run(campaign, { type: 'learnStunt', characterId: a.id, stunt: { ...template, id: id() } } as any),
    ).toThrow('Not enough');
  });
});
