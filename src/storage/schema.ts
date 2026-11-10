import { z } from 'zod';
import type { Campaign, CampaignExport, Character, RuleSetDefinition } from '../domain/types';

export const SCHEMA_VERSION = 1;
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const text = z.string().max(100_000);
const label = z.string().max(500);
const id = z.string().min(1).max(128);
const integer = z.number().int().min(0).max(1_000_000);
const number = z.number().finite().min(-1_000_000).max(1_000_000);
const visibility = z.enum(['shared', 'gm']);
const action = z.enum(['overcome', 'advantage', 'attack', 'defend']);
const outcome = z.enum(['failure', 'tie', 'success', 'style']);
const coordinate = z.number().min(0).max(1);
const aspect = z.object({
  id,
  name: label,
  kind: z.enum(['highConcept', 'trouble', 'character', 'game', 'situation', 'consequence', 'boost']),
  freeInvokes: integer,
  ownerId: id.optional(),
  freeInvokeOwnerId: id.optional(),
  freeInvokeGmOnly: z.boolean().optional(),
  visibility,
});
const stunt = z.object({
  id,
  name: label,
  description: text,
  refreshCost: z.number().min(0).max(20),
  fateCost: integer,
  limit: z.enum(['none', 'scene', 'conflict', 'session']),
  uses: integer,
  maxUses: integer,
});
export const rulesSchema: z.ZodType<RuleSetDefinition> = z
  .object({
    id,
    version: integer,
    name: label,
    contentVersion: label,
    aspectCount: z.number().int().min(2).max(20),
    phaseCount: z.number().int().min(0).max(20),
    skillCap: z.number().int().min(1).max(20),
    allocation: z.enum(['pyramid', 'columns']),
    skillSlots: z.record(z.string(), z.number().int().min(0).max(100)),
    refresh: z.number().int().min(1).max(100),
    freeStunts: z.number().int().min(0).max(100),
    stressTracks: z
      .array(
        z.object({ id, name: label, skillId: id, boxes: z.array(z.number().int().min(1).max(100)).max(20) }),
      )
      .max(20),
    consequenceSlots: z.array(z.number().int().min(1).max(100)).max(20),
    skills: z
      .array(z.object({ id, name: label, description: text, actions: z.array(action).max(4) }))
      .min(1)
      .max(100),
    houseRules: text,
  })
  .superRefine((rules, context) => {
    const skills = new Set(rules.skills.map((skill) => skill.id));
    rules.stressTracks.forEach((track, index) => {
      if (!skills.has(track.skillId))
        context.addIssue({
          code: 'custom',
          path: ['stressTracks', index, 'skillId'],
          message: 'A stress track must use a skill in this ruleset.',
        });
    });
    for (const [rank, slots] of Object.entries(rules.skillSlots)) {
      if (slots > 0 && (!/^\d+$/.test(rank) || Number(rank) < 1 || Number(rank) > rules.skillCap))
        context.addIssue({
          code: 'custom',
          path: ['skillSlots', rank],
          message: 'Creation slots must be within the configured skill cap.',
        });
    }
  });
const consequence = z.object({
  id,
  value: z.number().int().min(1).max(100),
  name: label,
  trackId: id.optional(),
  recovering: z.boolean(),
  recoveryStartedAt: label.optional(),
  incurredConflictId: id.optional(),
});
const pendingAward = z.object({
  id,
  characterId: id,
  amount: integer,
  boundary: z.enum(['scene', 'conflict']),
  reason: text,
});
export const characterSchema: z.ZodType<Character> = z.object({
  id,
  revision: integer,
  ownerId: id,
  name: label,
  pronouns: label,
  description: text,
  kind: z.enum(['pc', 'nameless', 'supporting', 'main']),
  visibility,
  status: z.enum(['draft', 'ready']),
  creationMode: z.enum(['full', 'quick']),
  aspects: z.array(aspect).max(100),
  phases: z.array(z.object({ id, story: text, characterIds: z.array(id).max(100) })).max(100),
  skills: z.record(z.string(), z.number().int().min(0).max(20)),
  stunts: z.array(stunt).max(200),
  extras: text,
  refreshAdjustment: z.number().int().min(-100).max(100),
  fatePoints: integer,
  stress: z.record(z.string(), z.array(z.number().int().min(1).max(100)).max(20)),
  consequences: z.array(consequence).max(30),
  milestones: z
    .array(
      z.object({
        id,
        type: z.enum(['minor', 'significant', 'major']),
        description: text,
        timestamp: label,
        choiceUsed: z.boolean().optional(),
      }),
    )
    .max(10_000),
  bankedSkillPoints: integer,
  portraitAssetId: id.optional(),
  notes: text,
  takenOut: z.boolean(),
  conceded: z.boolean(),
  extremeUsed: z.boolean(),
  npcTough: z.boolean().optional(),
});
export const assetSchema = z.object({
  id,
  name: label,
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  dataUrl: z.string().max(Math.ceil((MAX_ASSET_BYTES * 4) / 3) + 128),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  visibility,
});
const zone = z.object({
  id,
  name: label,
  x: coordinate,
  y: coordinate,
  width: coordinate,
  height: coordinate,
  aspect: label,
  connections: z.array(id).max(500),
});
const token = z.object({
  id,
  characterId: id.optional(),
  label,
  x: coordinate,
  y: coordinate,
  zoneId: id.optional(),
  visibility,
});
const annotation = z.object({ id, text, x: coordinate, y: coordinate, visibility });
const mapRevision = z.object({
  id,
  assetId: id,
  createdAt: label,
  zones: z.array(zone).max(500),
  tokens: z.array(token).max(1000),
  annotations: z.array(annotation).max(1000),
});
const roll = z.object({
  id,
  characterId: id,
  characterName: label,
  targetCharacterId: id.optional(),
  conflictId: id.optional(),
  harmResolved: z.boolean().optional(),
  action,
  skillId: id,
  skillName: label,
  dice: z.array(z.number().int().min(-1).max(1)).length(4),
  skill: number,
  modifier: number,
  opposition: number,
  total: number,
  shifts: number,
  outcome,
  explanation: text,
  agreedCost: z
    .object({
      severity: z.enum(['minor', 'serious']),
      description: text.min(1),
      aspect: z.object({ id, name: label.min(1), kind: z.enum(['situation', 'boost']) }).optional(),
    })
    .optional(),
  advantageExisting: z.boolean(),
  invocations: z
    .array(
      z.object({
        aspectId: id,
        name: label,
        free: z.boolean(),
        bonus: number,
        reroll: z.array(z.number().int().min(-1).max(1)).length(4).optional(),
      }),
    )
    .max(200),
  finalized: z.boolean(),
  undone: z.boolean().optional(),
  exchange: integer.optional(),
});
const undoChange = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('aspect'),
    location: z.enum(['issues', 'scene', 'character']),
    characterId: id.optional(),
    id,
    before: aspect.optional(),
    after: aspect.optional(),
  }),
  z.object({
    kind: z.literal('consequence'),
    characterId: id,
    id,
    before: consequence.optional(),
    after: consequence.optional(),
  }),
  z.object({ kind: z.literal('award'), id, before: pendingAward.optional(), after: pendingAward.optional() }),
  z.object({
    kind: z.literal('stress'),
    characterId: id,
    track: id,
    box: integer,
    before: z.boolean(),
    after: z.boolean(),
  }),
  z.object({
    kind: z.literal('flag'),
    characterId: id,
    field: z.enum(['takenOut', 'extremeUsed']),
    before: z.boolean(),
    after: z.boolean(),
  }),
  z.object({ kind: z.literal('fate'), characterId: id.optional(), delta: number }),
]);
export const campaignSchema: z.ZodType<Campaign> = z
  .object({
    id,
    revision: integer,
    name: label,
    tagline: label,
    setting: text,
    scale: label,
    bannerAssetId: id.optional(),
    bannerPosition: z.number().finite().min(0).max(100).optional(),
    kind: z.enum(['campaign', 'one-shot']),
    archived: z.boolean(),
    createdAt: label,
    updatedAt: label,
    rules: rulesSchema,
    issues: z.array(aspect).max(200),
    members: z
      .array(
        z.object({ id, name: label, role: z.enum(['gm', 'player']), characterIds: z.array(id).max(500) }),
      )
      .max(100),
    characters: z.array(characterSchema).max(1000),
    world: z
      .array(
        z.object({
          id,
          kind: z.enum(['note', 'location', 'faction', 'summary', 'reference']),
          title: label,
          body: text,
          visibility,
          assetId: id.optional(),
          tags: z.array(label).max(100),
        }),
      )
      .max(10_000),
    inventory: z
      .array(
        z.object({
          id,
          revision: integer,
          name: label,
          quantity: z.number().finite().min(0).max(1_000_000_000),
          unit: label,
          ownerId: id,
          description: text,
          visibility: z.enum(['shared', 'gm', 'character']),
        }),
      )
      .max(10_000),
    assets: z.array(assetSchema).max(500),
    maps: z
      .array(
        z.object({
          id,
          name: label,
          visibility,
          currentRevisionId: id,
          sharedRevisionId: id.optional(),
          revisions: z.array(mapRevision).min(1).max(100),
        }),
      )
      .max(200),
    play: z.object({
      scenarioId: label,
      scenarioName: label,
      sessionId: label,
      sessionName: label,
      sceneId: label,
      sceneName: label,
      conflictId: id.optional(),
      conflictType: z.enum(['physical', 'mental']),
      exchange: integer,
      actedIds: z.array(id).max(1000),
      aspects: z.array(aspect).max(500),
      npcFatePoints: integer,
      npcCarryover: integer.optional(),
      pendingAwards: z
        .array(
          z.object({
            id,
            characterId: id,
            amount: integer,
            boundary: z.enum(['scene', 'conflict']),
            reason: text,
          }),
        )
        .max(1000),
      contest: z.object({
        name: label,
        scores: z.record(z.string(), integer),
        target: z.number().int().min(1).max(100),
      }),
      challenge: z.object({
        name: label,
        tasks: z.array(z.object({ id, label, complete: z.boolean() })).max(1000),
      }),
    }),
    events: z
      .array(
        z.object({
          id,
          commandId: id,
          sequence: integer,
          timestamp: label,
          actorId: id,
          type: label,
          summary: text,
          visibility: z.enum(['shared', 'gm', 'character']),
          characterId: id.optional(),
          roll: roll.optional(),
          detail: text.optional(),
          undoChanges: z.array(undoChange).max(10000).optional(),
        }),
      )
      .max(50_000),
    processedCommandIds: z.array(id).max(100_000),
  })
  .superRefine((campaign, context) => {
    const characterIds = new Set(campaign.characters.map((character) => character.id));
    campaign.inventory.forEach((item, index) => {
      if (item.visibility === 'character' && !characterIds.has(item.ownerId))
        context.addIssue({
          code: 'custom',
          path: ['inventory', index, 'ownerId'],
          message: 'Character-visible inventory must be held by an existing character.',
        });
    });
    campaign.events.forEach((event, index) => {
      if (event.visibility === 'character' && !event.characterId)
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'characterId'],
          message: 'A character-visible event must identify its character audience.',
        });
    });
  });
export const campaignExportSchema: z.ZodType<CampaignExport> = z.object({
  format: z.literal('fate-core-companion'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: label,
  audience: z.enum(['gm', 'player']),
  campaign: campaignSchema,
});

export function assertSafeObject(value: unknown, depth = 0): void {
  if (depth > 40) throw new Error('This file is nested too deeply.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw new Error('This file contains an unsafe property.');
    assertSafeObject(child, depth + 1);
  }
}

export function assertReferences(c: Campaign): void {
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} identifiers.`);
  };
  for (const [label, values] of Object.entries({
    character: c.characters,
    member: c.members,
    asset: c.assets,
    map: c.maps,
    inventory: c.inventory,
    world: c.world,
    event: c.events,
  }))
    unique(
      values.map((v) => v.id),
      label,
    );
  unique(
    c.rules.skills.map((s) => s.id),
    'skill',
  );
  unique(
    c.rules.stressTracks.map((s) => s.id),
    'stress track',
  );
  const assets = new Set(c.assets.map((a) => a.id));
  const characters = new Set(c.characters.map((character) => character.id));
  if (c.inventory.some((item) => item.visibility === 'character' && !characters.has(item.ownerId)))
    throw new Error('Character-visible inventory must be held by an existing character.');
  if (c.bannerAssetId && !assets.has(c.bannerAssetId))
    throw new Error('The campaign banner image is missing.');
  for (const assetId of [
    ...c.characters.map((ch) => ch.portraitAssetId),
    ...c.world.map((w) => w.assetId),
  ].filter(Boolean))
    if (!assets.has(assetId!)) throw new Error('A referenced portrait or attachment is missing.');
  for (const map of c.maps) {
    unique(
      map.revisions.map((r) => r.id),
      'map revision',
    );
    const revisions = new Set(map.revisions.map((r) => r.id));
    if (
      !revisions.has(map.currentRevisionId) ||
      (map.sharedRevisionId && !revisions.has(map.sharedRevisionId))
    )
      throw new Error('A map points to a missing revision.');
    for (const revision of map.revisions) {
      if (!assets.has(revision.assetId)) throw new Error('A map image is missing.');
      unique(
        revision.zones.map((z) => z.id),
        'zone',
      );
      unique(
        revision.tokens.map((t) => t.id),
        'token',
      );
    }
  }
}
