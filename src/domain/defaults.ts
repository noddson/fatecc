import type { Aspect, Campaign, Character, RuleSetDefinition, SkillDefinition } from './types';
import sourceMetadata from '../content/source-metadata.json';
import acceleratedMetadata from '../content/accelerated-metadata.json';
import { isAccelerated, type FateSystem } from './editions';

export const id = () => crypto.randomUUID();

const skill = (name: string, description: string, actions: SkillDefinition['actions']): SkillDefinition => ({
  id: name.toLowerCase(),
  name,
  description,
  actions,
});
export const CORE_RULES: RuleSetDefinition = {
  system: 'fate-core',
  id: 'fate-core',
  version: 1,
  name: 'Fate Core',
  contentVersion: sourceMetadata.version,
  aspectCount: 5,
  phaseCount: 3,
  skillCap: 4,
  allocation: 'pyramid',
  skillSlots: { '4': 1, '3': 2, '2': 3, '1': 4 },
  refresh: 3,
  freeStunts: 3,
  stressTracks: [
    { id: 'physical', name: 'Physical', skillId: 'physique', boxes: [1, 2] },
    { id: 'mental', name: 'Mental', skillId: 'will', boxes: [1, 2] },
  ],
  consequenceSlots: [2, 4, 6],
  houseRules: '',
  skills: [
    skill('Athletics', 'Movement, balance, climbing, and avoiding physical danger.', [
      'overcome',
      'advantage',
      'defend',
    ]),
    skill('Burglary', 'Theft, locks, and bypassing security.', ['overcome', 'advantage']),
    skill('Contacts', 'People you know and your network of connections.', [
      'overcome',
      'advantage',
      'defend',
    ]),
    skill('Crafts', 'Making, repairing, and understanding machinery.', ['overcome', 'advantage']),
    skill('Deceive', 'Lies, disguises, and misdirection.', ['overcome', 'advantage', 'defend']),
    skill('Drive', 'Operating vehicles and daring maneuvers.', ['overcome', 'advantage', 'defend']),
    skill('Empathy', 'Reading emotions and understanding people.', ['overcome', 'advantage', 'defend']),
    skill('Fight', 'Close combat, armed or unarmed.', ['overcome', 'advantage', 'attack', 'defend']),
    skill('Investigate', 'Deliberate examination and finding connections.', ['overcome', 'advantage']),
    skill('Lore', 'Knowledge, education, and research.', ['overcome', 'advantage']),
    skill('Notice', 'Alertness and immediate awareness.', ['overcome', 'advantage', 'defend']),
    skill('Physique', 'Strength and physical endurance; affects physical stress.', ['overcome', 'advantage']),
    skill('Provoke', 'Provoking negative emotions and intimidating others.', [
      'overcome',
      'advantage',
      'attack',
    ]),
    skill('Rapport', 'Building trust, persuading, and inspiring.', ['overcome', 'advantage', 'defend']),
    skill('Resources', 'Access to material resources, independent of a coin ledger.', [
      'overcome',
      'advantage',
    ]),
    skill('Shoot', 'Ranged attacks and placing accurate shots.', ['advantage', 'attack']),
    skill('Stealth', 'Avoiding attention and moving unseen.', ['overcome', 'advantage', 'defend']),
    skill('Will', 'Mental resilience and concentration; affects mental stress.', [
      'overcome',
      'advantage',
      'defend',
    ]),
  ],
};

export const ACCELERATED_RULES: RuleSetDefinition = {
  system: 'fate-accelerated',
  id: 'fate-accelerated',
  version: 1,
  name: 'Fate Accelerated',
  contentVersion: acceleratedMetadata.version,
  aspectCount: 5,
  phaseCount: 0,
  skillCap: 3,
  allocation: 'approaches',
  skillSlots: { '3': 1, '2': 2, '1': 2, '0': 1 },
  refresh: 3,
  freeStunts: 3,
  stressTracks: [{ id: 'stress', name: 'Stress', boxes: [1, 2, 3] }],
  consequenceSlots: [2, 4, 6],
  houseRules: '',
  skills: [
    skill('Careful', 'Pay attention to detail and take the time to get it right.', [
      'overcome',
      'advantage',
      'attack',
      'defend',
    ]),
    skill('Clever', 'Think fast, solve problems, and find a weakness.', [
      'overcome',
      'advantage',
      'attack',
      'defend',
    ]),
    skill('Flashy', 'Draw attention with style and panache.', ['overcome', 'advantage', 'attack', 'defend']),
    skill('Forceful', 'Use strength, determination, or brute force.', [
      'overcome',
      'advantage',
      'attack',
      'defend',
    ]),
    skill('Quick', 'Act with speed and dexterity.', ['overcome', 'advantage', 'attack', 'defend']),
    skill('Sneaky', 'Use misdirection, stealth, or deceit.', ['overcome', 'advantage', 'attack', 'defend']),
  ],
};
export const rulesPreset = (system: FateSystem): RuleSetDefinition =>
  structuredClone(system === 'fate-accelerated' ? ACCELERATED_RULES : CORE_RULES);

export function createAspect(kind: Aspect['kind'], name = '', ownerId?: string): Aspect {
  return { id: id(), kind, name, ownerId, freeInvokes: 0, visibility: 'shared' };
}

export function createCharacter(
  rules: RuleSetDefinition = CORE_RULES,
  name = 'New character',
  kind: Character['kind'] = 'pc',
): Character {
  const characterId = id();
  return {
    id: characterId,
    revision: 0,
    ownerId: 'gm',
    name,
    pronouns: '',
    description: '',
    kind,
    visibility: kind === 'pc' ? 'shared' : 'gm',
    status: 'draft',
    creationMode: 'full',
    aspects: Array.from(
      { length: kind === 'nameless' ? 2 : kind === 'supporting' ? 3 : rules.aspectCount },
      (_, i) => createAspect(i === 0 ? 'highConcept' : i === 1 ? 'trouble' : 'character', '', characterId),
    ),
    phases: Array.from({ length: kind === 'pc' ? rules.phaseCount : 0 }, () => ({
      id: id(),
      story: '',
      characterIds: [],
    })),
    skills: isAccelerated(rules) ? Object.fromEntries(rules.skills.map((s) => [s.id, 0])) : {},
    stunts: [],
    extras: '',
    refreshAdjustment: 0,
    fatePoints: rules.refresh,
    stress: Object.fromEntries(rules.stressTracks.map((t) => [t.id, []])),
    consequences: [],
    milestones: [],
    bankedSkillPoints: 0,
    notes: '',
    takenOut: false,
    conceded: false,
    extremeUsed: false,
    ...(isAccelerated(rules) && kind === 'nameless'
      ? { mook: { goodAt: '', badAt: '', stressBoxes: 0 } }
      : {}),
  };
}

export function createCampaign(name = 'Untitled campaign', system: FateSystem = 'fate-core'): Campaign {
  const now = new Date().toISOString();
  return {
    id: id(),
    revision: 0,
    name,
    tagline: 'Every choice changes the story.',
    setting: '',
    scale: 'Local',
    kind: 'campaign',
    archived: false,
    createdAt: now,
    updatedAt: now,
    rules: rulesPreset(system),
    issues: [createAspect('game'), createAspect('game')],
    members: [{ id: 'gm', name: 'Game master', role: 'gm', characterIds: [] }],
    characters: [],
    world: [],
    inventory: [],
    assets: [],
    maps: [],
    events: [],
    processedCommandIds: [],
    play: {
      scenarioId: id(),
      scenarioName: 'Opening chapter',
      sessionId: id(),
      sessionName: 'Session 1',
      sceneId: id(),
      sceneName: 'The story begins',
      conflictType: 'physical',
      exchange: 0,
      actedIds: [],
      aspects: [],
      npcFatePoints: 0,
      pendingAwards: [],
      contest: { name: '', scores: {}, target: 3 },
      challenge: { name: '', tasks: [] },
    },
  };
}
