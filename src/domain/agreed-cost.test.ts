import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyCommand, latestRoll, type GameCommand } from './commands';
import { createAspect, createCampaign, createCharacter, id } from './defaults';
import type { Actor, Campaign } from './types';
import { projectCampaign } from '../network/projection';
import { campaignSchema } from '../storage/schema';
import { exportCampaign, exportCampaignZip, parseCampaignExport } from '../storage/backup';

const gm: Actor = { id: 'gm', role: 'gm', characterIds: [] };
type Input = GameCommand extends infer C ? (C extends GameCommand ? Omit<C, 'id'> : never) : never;
const run = (c: Campaign, command: Input, actor = gm) =>
  applyCommand(c, { ...command, id: id() } as GameCommand, actor);
const nativeCrypto = globalThis.crypto;
beforeEach(() =>
  vi.stubGlobal('crypto', {
    randomUUID: () => nativeCrypto.randomUUID(),
    getRandomValues: (bytes: Uint8Array) => {
      bytes.fill(1);
      return bytes;
    },
  }),
);
afterEach(() => vi.unstubAllGlobals());
function setup(opposition = 4, visibility: 'shared' | 'gm' = 'shared') {
  const campaign = createCampaign(),
    hero = createCharacter(campaign.rules, 'Mara');
  hero.skills = { notice: 4 };
  campaign.characters.push(hero);
  const rolled = run(campaign, {
    type: 'roll',
    characterId: hero.id,
    action: 'overcome',
    skillId: 'notice',
    opposition,
    visibility,
  });
  return {
    rolled,
    rollId: rolled.events[0].roll!.id,
    hero,
    player: { id: 'player', role: 'player', characterIds: [hero.id] } as Actor,
  };
}

it('records an agreed minor cost on the roll and preserves it in player JSON and ZIP backups', async () => {
  const { rolled, rollId, player } = setup();
  const next = run(
    rolled,
    { type: 'finalizeRoll', rollId, agreedCost: { description: 'The door opens, but the guards hear it.' } },
    player,
  );
  expect(latestRoll(next, rollId).agreedCost).toEqual({
    severity: 'minor',
    description: 'The door opens, but the guards hear it.',
  });
  expect(next.play.aspects).toEqual([]);
  expect(next.events.at(-1)?.summary).toContain('success at a minor cost');
  expect(projectCampaign(next).events.at(-1)?.roll?.agreedCost).toEqual(latestRoll(next, rollId).agreedCost);
  for (const backup of [await exportCampaign(next, 'player'), await exportCampaignZip(next, 'player')]) {
    expect(latestRoll((await parseCampaignExport(backup)).campaign, rollId).agreedCost).toEqual(
      latestRoll(next, rollId).agreedCost,
    );
  }
});

it('records success at a serious cost and creates a linked character aspect without spending resources', () => {
  const { rolled, rollId, hero } = setup(6);
  const command: GameCommand = {
    id: id(),
    type: 'finalizeRoll',
    rollId,
    agreedCost: {
      description: 'Escape through the broken window, injuring an ankle.',
      aspect: { kind: 'situation', name: 'Twisted ankle', target: 'character' },
    },
  };
  const next = applyCommand(rolled, command, gm);
  const cost = latestRoll(next, rollId).agreedCost!;
  expect(cost.severity).toBe('serious');
  expect(next.characters[0].aspects.at(-1)).toMatchObject({
    id: cost.aspect!.id,
    name: 'Twisted ankle',
    kind: 'situation',
    ownerId: hero.id,
    freeInvokes: 0,
  });
  expect(next.characters[0].fatePoints).toBe(hero.fatePoints);
  expect(next.characters[0].stress).toEqual(hero.stress);
  expect(applyCommand(next, command, gm)).toBe(next);
});

it('creates a visible cost boost for the GM/opposition and prevents player use of its free invocation', () => {
  const { rolled, rollId, hero, player } = setup();
  let next = run(
    rolled,
    {
      type: 'finalizeRoll',
      rollId,
      agreedCost: {
        description: 'The hurried barricade has a weak spot.',
        aspect: { kind: 'boost', name: 'Hasty work', target: 'scene' },
      },
    },
    player,
  );
  const boost = next.play.aspects[0];
  expect(boost).toMatchObject({ freeInvokes: 1, freeInvokeGmOnly: true, visibility: 'shared' });
  next = campaignSchema.parse(JSON.parse(JSON.stringify(next)));
  next = run(next, {
    type: 'roll',
    characterId: hero.id,
    action: 'overcome',
    skillId: 'notice',
    opposition: 6,
  });
  const second = next.events.at(-1)!.roll!.id;
  const before = structuredClone(next);
  expect(() =>
    run(next, { type: 'invoke', rollId: second, aspectId: boost.id, free: true, mode: 'bonus' }, player),
  ).toThrow('GM or opposition');
  expect(next).toEqual(before);
  next = run(next, { type: 'invoke', rollId: second, aspectId: boost.id, free: true, mode: 'bonus' });
  expect(next.play.aspects).toEqual([]);
  expect(latestRoll(next, rollId).agreedCost?.aspect?.name).toBe('Hasty work');
});

it('keeps private costs and associated effects out of player copies', () => {
  const { rolled, rollId } = setup(4, 'gm');
  const next = run(rolled, {
    type: 'finalizeRoll',
    rollId,
    agreedCost: { description: 'Private complication', aspect: { kind: 'boost', name: 'Secret opening' } },
  });
  expect(next.play.aspects[0].visibility).toBe('gm');
  expect(JSON.stringify(projectCampaign(next))).not.toContain('Private complication');
  expect(JSON.stringify(projectCampaign(next))).not.toContain('Secret opening');
});

it('rejects invalid or stale costs atomically and permits ordinary failure without a cost', () => {
  const { rolled, rollId } = setup();
  for (const agreedCost of [
    { description: ' ' },
    { description: 'Cost', aspect: { name: ' ', kind: 'boost' } },
    { description: 'Cost', aspect: { name: 'A', kind: 'boost', target: 'another-character' } },
  ]) {
    expect(() => run(rolled, { type: 'finalizeRoll', rollId, agreedCost } as Input)).toThrow();
    expect(rolled.play.aspects).toEqual([]);
  }
  const own = createAspect('character', 'Resourceful');
  rolled.characters[0].aspects.push(own);
  const improved = run(rolled, { type: 'invoke', rollId, aspectId: own.id, free: false, mode: 'bonus' });
  expect(() =>
    run(improved, { type: 'finalizeRoll', rollId, agreedCost: { description: 'No longer applicable' } }),
  ).toThrow('Overcome');
  const failed = setup(6);
  expect(
    latestRoll(run(failed.rolled, { type: 'finalizeRoll', rollId: failed.rollId }), failed.rollId).agreedCost,
  ).toBeUndefined();
});

it('undo removes only the linked cost effect and retains the historical cost record', () => {
  const { rolled, rollId } = setup();
  let next = run(rolled, {
    type: 'finalizeRoll',
    rollId,
    agreedCost: {
      description: 'A conspicuous crossing',
      aspect: { kind: 'situation', name: 'Tracks in the mud' },
    },
  });
  const unrelated = createAspect('situation', 'Heavy rain');
  next.play.aspects.push(unrelated);
  next = campaignSchema.parse(JSON.parse(JSON.stringify(next)));
  next = run(next, { type: 'undoRoll', rollId, reason: 'Wrong roll' });
  expect(next.play.aspects).toEqual([unrelated]);
  expect(latestRoll(next, rollId).undone).toBe(true);
  expect(next.events.find((event) => event.type === 'finalizeRoll')?.roll?.agreedCost?.description).toBe(
    'A conspicuous crossing',
  );
});

it('protects a cost aspect used by a paid invocation until the dependent roll is undone', () => {
  const { rolled, rollId, hero } = setup();
  let next = run(rolled, {
    type: 'finalizeRoll',
    rollId,
    agreedCost: { description: 'A visible trail', aspect: { kind: 'situation', name: 'Tracks in the mud' } },
  });
  const aspectId = next.play.aspects[0].id;
  next = run(next, {
    type: 'roll',
    characterId: hero.id,
    action: 'overcome',
    skillId: 'notice',
    opposition: 6,
  });
  const dependent = next.events.at(-1)!.roll!.id;
  next = run(next, { type: 'invoke', rollId: dependent, aspectId, free: false, mode: 'bonus' });
  expect(() => run(next, { type: 'undoRoll', rollId, reason: 'Correction' })).toThrow('dependent roll');
  next = run(next, { type: 'undoRoll', rollId: dependent, reason: 'Correction' });
  next = run(next, { type: 'undoRoll', rollId, reason: 'Correction' });
  expect(next.play.aspects).toEqual([]);
});
