import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { ACCELERATED_RULES, CORE_RULES, createCampaign, createCharacter, id } from './defaults';
import { isAccelerated, systemName } from './editions';
import { applyMilestoneChoice, deriveCharacter, initiative, validateCharacter, validateHarm } from './rules';
import { applyCommand, type GameCommand } from './commands';
import type { Campaign } from './types';
import { prepareCharacterImport } from './character-import';
import { cloneCampaign, exportCampaign, exportCampaignZip, parseCampaignExport } from '../storage/backup';
import { campaignSchema } from '../storage/schema';
import { projectCampaign } from '../network/projection';
import { metadataForRules, referencesForRules } from '../content/reference';
import { ruleSource } from './rule-sources';

const gm = { id: 'gm', role: 'gm' as const, characterIds: [] };
type Input = GameCommand extends infer C ? (C extends GameCommand ? Omit<C, 'id'> : never) : never;
const run = (c: Campaign, command: Input) => applyCommand(c, { ...command, id: id() } as GameCommand, gm);
function fixture() {
  const c = createCampaign('Sky pirates', 'fate-accelerated');
  const a = createCharacter(c.rules, 'Captain');
  a.skills = { careful: 0, clever: 2, flashy: 1, forceful: 2, quick: 3, sneaky: 1 };
  a.aspects[0].name = 'Captain of the Cirrus Skimmer';
  a.aspects[1].name = 'Wanted by the Royal Navy';
  a.aspects[2].name = 'Never abandon my crew';
  const b = createCharacter(c.rules, 'Navigator');
  b.skills = { careful: 3, clever: 2, flashy: 1, forceful: 0, quick: 1, sneaky: 2 };
  c.characters = [a, b];
  return { c, a, b };
}

describe('Campaign rules systems', () => {
  it('keeps legacy custom campaigns on Core and isolates newly selected presets', () => {
    const core = createCampaign();
    delete core.rules.system;
    core.rules.id = 'old-custom-core';
    expect(systemName(core.rules)).toBe('Fate Core');
    const accelerated = createCampaign('New', 'fate-accelerated');
    expect(systemName(accelerated.rules)).toBe('Fate Accelerated');
    accelerated.rules.skills.pop();
    expect(ACCELERATED_RULES.skills).toHaveLength(6);
    expect(CORE_RULES.skills).toHaveLength(18);
  });
  it('allows three aspects and no phase trio, but enforces the six starting approach ratings', () => {
    const { c, a } = fixture();
    a.status = 'ready';
    expect(a.phases).toEqual([]);
    expect(validateCharacter(a, c.rules)).toEqual([]);
    a.skills.careful = 3;
    expect(validateCharacter(a, c.rules).some((i) => i.field === 'skills' && i.severity === 'error')).toBe(
      true,
    );
    expect(validateCharacter(a, c.rules).every((i) => i.source?.startsWith('Accelerated SRD'))).toBe(true);
  });
  it('uses a shared rated track regardless of approaches and rejects Core extreme consequences', () => {
    const { c, a } = fixture();
    a.skills.forceful = a.skills.careful = 5;
    expect(deriveCharacter(a, c.rules).tracks).toMatchObject([
      { id: 'stress', boxes: [1, 2, 3], bonusMild: false },
    ]);
    expect(deriveCharacter(a, c.rules).consequenceSlots).toEqual([{ value: 2 }, { value: 4 }, { value: 6 }]);
    expect(() => validateHarm(a, c.rules, 'stress', 3, 3, [])).not.toThrow();
    expect(() => validateHarm(a, c.rules, 'stress', 4, 3, [])).toThrow('entire hit');
    expect(() => validateHarm(a, c.rules, 'stress', 4, 2, [{ value: 2 }])).not.toThrow();
    expect(() => validateHarm(a, c.rules, 'stress', 8, undefined, [], true)).toThrow('Core rule');
  });
  it('sorts physical conflicts by Quick and mental conflicts by Careful', () => {
    const { c, a, b } = fixture();
    expect(initiative([b, a], 'physical', c.rules).map((ch) => ch.id)).toEqual([a.id, b.id]);
    expect(initiative([a, b], 'mental', c.rules).map((ch) => ch.id)).toEqual([b.id, a.id]);
  });
  it('allows swapping +3 and +0 at a minor milestone and advances beyond the creation cap without columns', () => {
    const { c, a } = fixture();
    expect(
      applyMilestoneChoice(a, c.rules, { kind: 'swapSkills', first: 'quick', second: 'careful' }).skills
        .careful,
    ).toBe(3);
    let next = run(c, {
      type: 'milestone',
      characterId: a.id,
      milestone: 'significant',
      description: 'Escaped the navy',
    });
    next = run(next, { type: 'spendSkill', characterId: a.id, skillId: 'quick' });
    expect(next.characters[0].skills.quick).toBe(4);
    expect(next.rules.skillCap).toBe(3);
    next = run(next, {
      type: 'milestone',
      characterId: a.id,
      milestone: 'major',
      description: 'Freed the coast',
    });
    next = run(next, { type: 'spendSkill', characterId: a.id, skillId: 'quick' });
    expect(next.characters[0].skills.quick).toBe(5);
    expect(deriveCharacter(next.characters[0], next.rules).refresh).toBe(4);
    next.characters[0].bankedSkillPoints = 1;
    expect(() =>
      run(next, { type: 'spendSkill', characterId: a.id, skillId: 'quick', raiseCap: true }),
    ).toThrow('Superb');
    expect(validateCharacter(next.characters[0], next.rules).some((i) => i.field === 'skills')).toBe(false);
  });
  it('uses the same three free stunts before reducing refresh', () => {
    const { c, a } = fixture();
    a.stunts = Array.from({ length: 4 }, () => ({
      id: id(),
      name: 'Trick',
      description: 'An approach stunt',
      refreshCost: 1,
      fateCost: 0,
      limit: 'none' as const,
      uses: 0,
      maxUses: 1,
    }));
    expect(deriveCharacter(a, c.rules).refresh).toBe(2);
  });
  it('permits a +0 approach helper, spends their action, and restores both actions on roll undo', () => {
    const { c, a, b } = fixture();
    b.skills.quick = 0;
    let next = run(c, { type: 'boundary', boundary: 'conflict', phase: 'start' });
    next = run(next, {
      type: 'roll',
      characterId: a.id,
      skillId: 'quick',
      action: 'overcome',
      opposition: 2,
      helperIds: [b.id],
    });
    const roll = next.events.at(-1)!.roll!;
    expect(roll.modifier).toBe(1);
    expect(next.play.actedIds).toEqual([b.id, a.id]);
    expect(() =>
      run(next, { type: 'roll', characterId: b.id, skillId: 'quick', action: 'attack', opposition: 0 }),
    ).toThrow('already took');
    next = run(next, { type: 'undoRoll', rollId: roll.id, reason: 'Wrong action' });
    expect(next.play.actedIds).toEqual([]);
  });
  it('clears shared stress at scene end and permits narrative recovery without a treatment roll', () => {
    const { c, a } = fixture();
    let next = run(c, {
      type: 'harm',
      characterId: a.id,
      trackId: 'stress',
      shifts: 4,
      stressBox: 2,
      consequences: [{ value: 2, name: 'Shaken' }],
    });
    next = run(next, { type: 'boundary', boundary: 'scene', phase: 'end' });
    expect(next.characters[0].stress.stress).toEqual([]);
    expect(next.characters[0].consequences).toHaveLength(1);
    const con = next.characters[0].consequences[0];
    next = run(next, { type: 'recover', characterId: a.id, consequenceId: con.id, stage: 'start' });
    expect(() =>
      run(next, { type: 'recover', characterId: a.id, consequenceId: con.id, stage: 'clear' }),
    ).toThrow('confirm');
    next = run(next, {
      type: 'recover',
      characterId: a.id,
      consequenceId: con.id,
      stage: 'clear',
      wholePeriodElapsed: true,
    });
    expect(next.characters[0].consequences).toEqual([]);
    expect(next.characters[0].aspects.some((aspect) => aspect.id === con.id)).toBe(false);
  });
  it('rolls mook specialties and weaknesses with their own stress capacity', () => {
    const { c } = fixture();
    const mook = createCharacter(c.rules, 'Four thugs', 'nameless');
    mook.mook = { goodAt: 'Ganging up', badAt: 'Thinking ahead', stressBoxes: 0, groupSize: 4 };
    c.characters.push(mook);
    expect(deriveCharacter(mook, c.rules)).toMatchObject({
      tracks: [{ id: 'stress', boxes: [1, 2] }],
      consequenceSlots: [],
    });
    for (const [skillId, rating] of [
      ['mook-good', 2],
      ['mook-bad', -2],
      ['mook-ordinary', 0],
    ] as const) {
      const next = run(c, { type: 'roll', characterId: mook.id, skillId, action: 'overcome', opposition: 2 });
      expect(next.events.at(-1)!.roll!.skill).toBe(rating);
      expect(campaignSchema.parse(next).characters.at(-1)!.mook).toEqual(mook.mook);
    }
  });
  it('preserves the system and mook data in JSON, ZIP, duplication, and player projections', async () => {
    const { c } = fixture();
    const mook = createCharacter(c.rules, 'Scout', 'nameless');
    mook.mook = { goodAt: 'Watching', badAt: 'Fighting', stressBoxes: 1 };
    mook.visibility = 'shared';
    c.characters.push(mook);
    for (const backup of [await exportCampaign(c), await exportCampaignZip(c)]) {
      const parsed = await parseCampaignExport(backup);
      expect(parsed.campaign.rules).toEqual(c.rules);
      expect(parsed.campaign.characters.at(-1)!.mook).toEqual(mook.mook);
    }
    expect(isAccelerated(cloneCampaign(c).rules)).toBe(true);
    expect(campaignSchema.parse(projectCampaign(c)).rules).toEqual(c.rules);
  });
  it('blocks character imports across systems', () => {
    const { c, a } = fixture();
    expect(() =>
      prepareCharacterImport({ character: a, assets: [], rules: c.rules }, createCampaign()),
    ).toThrow('same rules system');
  });
  it('provides a reproducible, separate offline Accelerated library and edition-correct help', () => {
    const entries = referencesForRules(ACCELERATED_RULES);
    expect(entries.length).toBe(metadataForRules(ACCELERATED_RULES).entryCount);
    expect(entries.every((e) => e.source.includes('Accelerated'))).toBe(true);
    expect(
      entries.some((e) => e.body.includes('one shift for Box 1, two for Box 2, or three for Box 3')),
    ).toBe(true);
    expect(ruleSource(ACCELERATED_RULES, 'skills').url).toContain('/fate-accelerated/');
    expect(
      execFileSync('python3', ['scripts/import-accelerated.py', '--check'], { encoding: 'utf8' }),
    ).toContain('Verified');
  });
});
