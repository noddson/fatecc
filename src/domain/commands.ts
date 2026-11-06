import type {
  Action,
  Actor,
  Aspect,
  Campaign,
  Character,
  GameEvent,
  RollRecord,
  Stunt,
  Visibility,
} from './types';
import {
  applyMilestoneChoice,
  deriveCharacter,
  resolveAction,
  resolveMobHit,
  rollDice,
  supportedColumns,
  teamworkBonus,
  validateHarm,
} from './rules';
import type { MilestoneChoice } from './rules';
import { createAspect, id } from './defaults';

interface BaseCommand {
  id: string;
  expectedRevision?: number;
}
export type GameCommand = BaseCommand &
  (
    | {
        type: 'roll';
        characterId: string;
        action: Action;
        skillId: string;
        opposition: number;
        modifier?: number;
        advantageExisting?: boolean;
        helperIds?: string[];
        targetCharacterId?: string;
        visibility?: Visibility;
      }
    | {
        type: 'invoke';
        rollId: string;
        aspectId: string;
        free: boolean;
        mode: 'bonus' | 'reroll';
        hostile?: boolean;
      }
    | {
        type: 'finalizeRoll';
        rollId: string;
        aspectName?: string;
        existingAspectId?: string;
        reduceAttackForBoost?: boolean;
      }
    | { type: 'compel'; characterId: string; accepted: boolean; reason: string; carryToNextScene?: boolean }
    | { type: 'adjustFate'; characterId: string; amount: number; reason: string }
    | {
        type: 'boundary';
        boundary: 'scene' | 'session' | 'scenario' | 'conflict';
        phase: 'start' | 'end';
        name?: string;
        breather?: boolean;
        conflictType?: 'physical' | 'mental';
        participantIds?: string[];
        npcInteraction?: boolean;
      }
    | {
        type: 'harm';
        characterId: string;
        trackId: string;
        shifts: number;
        stressBox?: number;
        consequences?: { value: number; name: string; trackId?: string }[];
        sourceCharacterId?: string;
        sourceRollId?: string;
        extremeAspectId?: string;
        extremeName?: string;
      }
    | {
        type: 'recover';
        characterId: string;
        consequenceId: string;
        stage: 'start' | 'clear';
        recoveryTotal?: number;
        selfTreatment?: boolean;
        wholePeriodElapsed?: boolean;
      }
    | { type: 'concede' | 'takenOut'; characterId: string; reason: string }
    | { type: 'useStunt'; characterId: string; stuntId: string }
    | { type: 'learnStunt'; characterId: string; stunt: Stunt }
    | { type: 'mobHarm'; characterIds: string[]; shifts: number }
    | { type: 'nextExchange' }
    | { type: 'contest'; name?: string; characterId?: string; victories?: number; reset?: boolean }
    | { type: 'challenge'; name?: string; taskId?: string; label?: string; complete?: boolean }
    | {
        type: 'milestone';
        characterId: string;
        milestone: 'minor' | 'significant' | 'major';
        description: string;
        choice?: MilestoneChoice;
        highConcept?: string;
        extremeAspectName?: string;
      }
    | { type: 'milestoneChoice'; characterId: string; milestoneId: string; choice: MilestoneChoice }
    | { type: 'spendSkill'; characterId: string; skillId: string; raiseCap?: boolean }
    | { type: 'storyDetail'; characterId: string; description: string }
    | { type: 'correction'; eventId: string; reason: string }
    | {
        type: 'applyDraft';
        characterId: string;
        baseRevision: number;
        changes: { description?: string; notes?: string; extras?: string };
      }
    | {
        type: 'moveToken';
        mapId: string;
        revisionId: string;
        tokenId: string;
        x: number;
        y: number;
        zoneId?: string;
      }
    | { type: 'assignPlayer'; memberId: string; name: string; characterIds: string[] }
    | { type: 'breather' }
  );

const integer = (value: number, name: string, min = -1000, max = 1000) => {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be a whole number between ${min} and ${max}.`);
};
function findCharacter(campaign: Campaign, characterId: string): Character {
  const character = campaign.characters.find((c) => c.id === characterId);
  if (!character) throw new Error('Character not found.');
  return character;
}
function findAspect(campaign: Campaign, aspectId: string): Aspect {
  const aspect = [
    ...campaign.issues,
    ...campaign.play.aspects,
    ...campaign.characters.flatMap((c) => c.aspects),
  ].find((a) => a.id === aspectId);
  if (!aspect) throw new Error('Aspect not found.');
  return aspect;
}
function canSeeAspect(campaign: Campaign, aspect: Aspect, actor: Actor): boolean {
  return (
    actor.role === 'gm' ||
    (aspect.visibility === 'shared' &&
      !campaign.characters.some(
        (character) => character.visibility === 'gm' && character.aspects.some((a) => a.id === aspect.id),
      ))
  );
}
export function latestRoll(campaign: Campaign, rollId: string): RollRecord {
  const event = [...campaign.events].reverse().find((e) => e.roll?.id === rollId);
  if (!event?.roll) throw new Error('Roll not found.');
  return structuredClone(event.roll);
}
export function activeRolls(campaign: Campaign): RollRecord[] {
  const rolls = new Map<string, RollRecord>();
  for (const event of campaign.events) if (event.roll) rolls.set(event.roll.id, event.roll);
  return [...rolls.values()];
}

function spend(campaign: Campaign, character: Character, amount: number): void {
  integer(amount, 'Fate point cost', 0);
  if (character.kind !== 'pc') {
    if (campaign.play.npcFatePoints < amount)
      throw new Error('The NPC scene pool has insufficient Fate points.');
    campaign.play.npcFatePoints -= amount;
  } else {
    if (character.fatePoints < amount) throw new Error('Not enough Fate points.');
    character.fatePoints -= amount;
  }
}
function award(campaign: Campaign, character: Character, amount: number): void {
  if (character.kind === 'pc') character.fatePoints += amount;
  else campaign.play.npcFatePoints += amount;
}
function checkOwner(actor: Actor, character: Character) {
  if (actor.role !== 'gm' && !actor.characterIds.includes(character.id))
    throw new Error('You do not control this character.');
}
const gmOnly = new Set<GameCommand['type']>([
  'adjustFate',
  'boundary',
  'compel',
  'recover',
  'nextExchange',
  'contest',
  'challenge',
  'milestone',
  'milestoneChoice',
  'spendSkill',
  'correction',
  'takenOut',
  'applyDraft',
  'learnStunt',
  'mobHarm',
  'assignPlayer',
  'breather',
]);

/** The repository commits the returned campaign atomically. Failed commands never mutate the input. */
export function applyCommand(original: Campaign, command: GameCommand, actor: Actor): Campaign {
  if (!command || typeof command.id !== 'string' || command.id.length < 1 || command.id.length > 200)
    throw new Error('A stable command identifier is required.');
  if (original.processedCommandIds.includes(command.id)) return original;
  if (command.expectedRevision !== undefined && command.expectedRevision !== original.revision)
    throw new Error('This campaign changed. Review the latest version before retrying.');
  if (!actor || !['gm', 'player'].includes(actor.role))
    throw new Error('A valid session identity is required.');
  if (gmOnly.has(command.type) && actor.role !== 'gm')
    throw new Error('Only the game master can perform this action.');
  const campaign = structuredClone(original);
  const timestamp = new Date().toISOString();
  let event: Omit<GameEvent, 'id' | 'sequence' | 'commandId' | 'timestamp' | 'actorId'> = {
    type: command.type,
    summary: '',
    visibility: 'shared',
  };
  let character: Character | undefined;
  if ('characterId' in command && command.characterId) {
    character = findCharacter(campaign, command.characterId);
    checkOwner(actor, character);
    event.characterId = character.id;
    event.visibility = character.visibility;
  }
  const touch = (c: Character) => {
    c.revision++;
  };
  const resetUsage = (limit: 'scene' | 'session' | 'conflict') =>
    campaign.characters.forEach((c) =>
      c.stunts
        .filter((s) => s.limit === limit)
        .forEach((s) => {
          s.uses = 0;
        }),
    );
  const settleAwards = (boundary: 'scene' | 'conflict') => {
    campaign.play.pendingAwards
      .filter((a) => a.boundary === boundary)
      .forEach((pending) => {
        const recipient = campaign.characters.find((c) => c.id === pending.characterId);
        if (recipient) {
          award(campaign, recipient, pending.amount);
          touch(recipient);
        }
      });
    campaign.play.pendingAwards = campaign.play.pendingAwards.filter((a) => a.boundary !== boundary);
  };

  switch (command.type) {
    case 'roll': {
      const c = character!;
      if (!['overcome', 'advantage', 'attack', 'defend'].includes(command.action))
        throw new Error('Unknown Fate action.');
      const skill = campaign.rules.skills.find((s) => s.id === command.skillId);
      if (!skill) throw new Error('Choose a skill in this game.');
      integer(command.opposition, 'Opposition');
      integer(command.modifier ?? 0, 'Modifier');
      if (c.takenOut || c.conceded) throw new Error('This character has left the conflict.');
      if (campaign.play.conflictId && command.action !== 'defend' && campaign.play.actedIds.includes(c.id))
        throw new Error('This character already took a proactive action this exchange.');
      const helpers = (command.helperIds ?? []).map((helperId) => findCharacter(campaign, helperId));
      if (actor.role !== 'gm' && helpers.some((h) => h.visibility === 'gm'))
        throw new Error('That helper is unavailable.');
      const helperBonus = teamworkBonus(c, helpers, command.skillId);
      const dice = rollDice();
      const modifier = (command.modifier ?? 0) + helperBonus;
      const rating = c.skills[command.skillId] ?? 0;
      const total = dice.reduce((sum, die) => sum + die, 0) + rating + modifier;
      const resolution = resolveAction(command.action, total, command.opposition, command.advantageExisting);
      if (command.targetCharacterId) {
        const target = findCharacter(campaign, command.targetCharacterId);
        if (actor.role !== 'gm' && target.visibility === 'gm') throw new Error('Target is unavailable.');
      }
      const roll: RollRecord = {
        id: id(),
        characterId: c.id,
        characterName: c.name,
        action: command.action,
        skillId: skill.id,
        skillName: skill.name,
        dice,
        skill: rating,
        modifier,
        opposition: command.opposition,
        total,
        shifts: resolution.shifts,
        outcome: resolution.outcome,
        explanation: resolution.explanation,
        advantageExisting: !!command.advantageExisting,
        invocations: [],
        finalized: false,
        targetCharacterId: command.targetCharacterId,
        conflictId: campaign.play.conflictId,
        harmResolved: command.action !== 'attack' || resolution.damage === 0,
      };
      if (campaign.play.conflictId && command.action !== 'defend') campaign.play.actedIds.push(c.id);
      event = {
        ...event,
        roll,
        visibility: c.visibility === 'gm' ? 'gm' : (command.visibility ?? 'shared'),
        summary: `${c.name} · ${skill.name} ${total >= 0 ? '+' : ''}${total} · ${resolution.outcome}`,
      };
      break;
    }
    case 'invoke': {
      const roll = latestRoll(campaign, command.rollId);
      const c = findCharacter(campaign, roll.characterId);
      checkOwner(actor, c);
      if (roll.finalized) throw new Error('This roll is finalized. Record a correction instead.');
      const aspect = findAspect(campaign, command.aspectId);
      if (!canSeeAspect(campaign, aspect, actor)) throw new Error('Aspect is unavailable.');
      if (!aspect.name.trim()) throw new Error('Name the aspect before invoking it.');
      if (aspect.kind === 'boost' && !command.free)
        throw new Error(
          'A boost can only be invoked for free, once; Fate points cannot buy additional uses.',
        );
      if (command.free) {
        if (aspect.freeInvokes < 1) throw new Error('This aspect has no free invocations remaining.');
        if (
          actor.role !== 'gm' &&
          aspect.freeInvokeOwnerId &&
          !actor.characterIds.includes(aspect.freeInvokeOwnerId)
        )
          throw new Error('The free invocation belongs to another character.');
        aspect.freeInvokes--;
      } else {
        if (roll.invocations.some((inv) => !inv.free && inv.aspectId === aspect.id))
          throw new Error('An aspect may only receive one paid invocation on a single roll.');
        spend(campaign, c, 1);
        const target = aspect.ownerId && campaign.characters.find((p) => p.id === aspect.ownerId);
        if (target && target.id !== c.id && (command.hostile ?? roll.targetCharacterId === target.id))
          campaign.play.pendingAwards.push({
            id: id(),
            characterId: target.id,
            amount: 1,
            boundary: 'scene',
            reason: `Hostile invocation of ${aspect.name}`,
          });
      }
      if (!['bonus', 'reroll'].includes(command.mode)) throw new Error('Choose +2 or reroll.');
      const reroll = command.mode === 'reroll' ? rollDice() : undefined;
      if (reroll) roll.dice = reroll;
      roll.invocations.push({
        aspectId: aspect.id,
        name: aspect.name,
        free: command.free,
        bonus: reroll ? 0 : 2,
        reroll,
      });
      roll.total =
        roll.dice.reduce((sum, die) => sum + die, 0) +
        roll.skill +
        roll.modifier +
        roll.invocations.reduce((sum, inv) => sum + inv.bonus, 0);
      const result = resolveAction(roll.action, roll.total, roll.opposition, roll.advantageExisting);
      Object.assign(roll, {
        shifts: result.shifts,
        outcome: result.outcome,
        explanation: result.explanation,
      });
      roll.harmResolved = roll.action !== 'attack' || result.damage === 0;
      if (aspect.kind === 'boost') {
        campaign.play.aspects = campaign.play.aspects.filter((a) => a.id !== aspect.id);
        campaign.issues = campaign.issues.filter((a) => a.id !== aspect.id);
        campaign.characters.forEach((character) => {
          character.aspects = character.aspects.filter((a) => a.id !== aspect.id);
        });
      }
      touch(c);
      const originalVisibility =
        campaign.events.find((e) => e.roll?.id === roll.id)?.visibility ?? c.visibility;
      event = {
        ...event,
        characterId: c.id,
        visibility:
          originalVisibility === 'gm' || c.visibility === 'gm' || aspect.visibility === 'gm'
            ? 'gm'
            : 'shared',
        roll,
        summary: `${c.name} invokes ${aspect.name}: ${command.mode === 'bonus' ? '+2' : 'reroll'} → ${roll.total}`,
      };
      break;
    }
    case 'finalizeRoll': {
      const roll = latestRoll(campaign, command.rollId);
      const c = findCharacter(campaign, roll.characterId);
      checkOwner(actor, c);
      if (roll.finalized) throw new Error('This roll has already been finalized.');
      const result = resolveAction(roll.action, roll.total, roll.opposition, roll.advantageExisting);
      const tradeForBoost =
        command.reduceAttackForBoost && roll.action === 'attack' && result.outcome === 'style';
      if (command.reduceAttackForBoost && !tradeForBoost)
        throw new Error('Only an attack that succeeds with style can trade one damage shift for a boost.');
      if (result.boost || tradeForBoost) {
        const boost = createAspect('boost', command.aspectName?.trim() || `${c.name}'s opening`);
        boost.freeInvokes = 1;
        boost.freeInvokeOwnerId = c.id;
        boost.visibility = c.visibility;
        campaign.play.aspects.push(boost);
      }
      if (result.freeInvokes) {
        if (roll.advantageExisting) {
          if (!command.existingAspectId)
            throw new Error('Choose the existing aspect to receive free invocations.');
          const aspect = findAspect(campaign, command.existingAspectId);
          if (!canSeeAspect(campaign, aspect, actor)) throw new Error('Aspect is unavailable.');
          if (aspect.kind === 'boost')
            throw new Error(
              'A boost is not an enduring aspect. Create a new advantage to promote its idea into an aspect.',
            );
          aspect.freeInvokes += result.freeInvokes;
          aspect.freeInvokeOwnerId = c.id;
        } else {
          const aspect = createAspect('situation', command.aspectName?.trim() || 'New advantage');
          aspect.freeInvokes = result.freeInvokes;
          aspect.freeInvokeOwnerId = c.id;
          aspect.visibility = c.visibility;
          campaign.play.aspects.push(aspect);
        }
      }
      if (tradeForBoost)
        roll.explanation = `Inflict a ${result.damage - 1}-shift hit and gain a boost (one shift traded).`;
      roll.finalized = true;
      event = {
        ...event,
        characterId: c.id,
        visibility: campaign.events.find((e) => e.roll?.id === roll.id)?.visibility ?? c.visibility,
        roll,
        summary: `${c.name} finalizes ${roll.action}: ${roll.outcome}`,
      };
      break;
    }
    case 'compel': {
      const c = character!;
      if (!command.reason.trim()) throw new Error('Describe the negotiated complication.');
      if (command.accepted) {
        award(campaign, c, 1);
        if (c.kind !== 'pc' && command.carryToNextScene)
          campaign.play.npcCarryover = (campaign.play.npcCarryover ?? 0) + 1;
      } else spend(campaign, c, 1);
      touch(c);
      event.summary = `${c.name} ${command.accepted ? 'accepts' : 'refuses'} a compel (${command.accepted ? '+1' : '−1'} Fate point)`;
      event.detail = command.reason;
      break;
    }
    case 'adjustFate': {
      const c = character!;
      integer(command.amount, 'Adjustment');
      if (!command.reason.trim()) throw new Error('Describe the reason for this adjustment.');
      if (command.amount < 0) spend(campaign, c, -command.amount);
      else award(campaign, c, command.amount);
      touch(c);
      event.summary = `${c.name}: ${command.amount >= 0 ? '+' : ''}${command.amount} Fate points`;
      event.detail = command.reason;
      break;
    }
    case 'storyDetail': {
      const c = character!;
      if (!command.description.trim()) throw new Error('Describe the story detail agreed by the table.');
      spend(campaign, c, 1);
      touch(c);
      event.summary = `${c.name} declares a story detail (−1 Fate point)`;
      event.detail = command.description;
      break;
    }
    case 'boundary': {
      if (command.phase === 'start') {
        if (command.boundary === 'session' || command.boundary === 'scenario') {
          campaign.characters
            .filter((c) => c.kind === 'pc')
            .forEach((c) => {
              const refresh = deriveCharacter(c, campaign.rules).refresh;
              if (refresh < 1)
                throw new Error(`${c.name} has invalid refresh. Correct the sheet before starting.`);
              c.fatePoints = command.boundary === 'scenario' ? refresh : Math.max(c.fatePoints, refresh);
              touch(c);
            });
          if (command.boundary === 'session') {
            campaign.play.sessionId = id();
            campaign.play.sessionName = command.name || 'New session';
            resetUsage('session');
          } else {
            campaign.play.scenarioId = id();
            campaign.play.scenarioName = command.name || 'New scenario';
          }
        } else if (command.boundary === 'scene') {
          if (campaign.play.conflictId) throw new Error('End the conflict before changing scenes.');
          settleAwards('scene');
          campaign.play.sceneId = id();
          campaign.play.sceneName = command.name || 'New scene';
          campaign.play.aspects = [];
          resetUsage('scene');
          const participants =
            command.participantIds ?? campaign.characters.filter((c) => c.kind === 'pc').map((c) => c.id);
          const pcCount = new Set(
            participants.filter((characterId) => findCharacter(campaign, characterId).kind === 'pc'),
          ).size;
          campaign.play.npcFatePoints =
            pcCount + (command.npcInteraction === false ? 0 : (campaign.play.npcCarryover ?? 0));
          if (command.npcInteraction !== false) campaign.play.npcCarryover = 0;
        } else {
          if (campaign.play.conflictId) throw new Error('A conflict is already in progress.');
          campaign.play.conflictId = id();
          campaign.play.conflictType = command.conflictType ?? 'physical';
          campaign.play.exchange = 1;
          campaign.play.actedIds = [];
          campaign.characters.forEach((c) => {
            c.takenOut = false;
            c.conceded = false;
          });
          resetUsage('conflict');
        }
      } else {
        if (command.boundary === 'conflict') {
          if (!campaign.play.conflictId) throw new Error('No conflict is in progress.');
          settleAwards('conflict');
          campaign.play.conflictId = undefined;
          campaign.play.actedIds = [];
          if (command.breather)
            campaign.characters.forEach((c) => {
              c.stress = Object.fromEntries(campaign.rules.stressTracks.map((t) => [t.id, []]));
              touch(c);
            });
        } else if (command.boundary === 'scene') {
          if (campaign.play.conflictId) throw new Error('End the conflict before ending the scene.');
          settleAwards('scene');
          campaign.play.aspects = [];
        }
      }
      event.summary = `${command.phase === 'start' ? 'Started' : 'Ended'} ${command.boundary}${command.name ? `: ${command.name}` : ''}${command.breather ? ' · stress cleared after a breather' : ''}`;
      break;
    }
    case 'harm': {
      const c = character!;
      const consequences = command.consequences ?? [];
      if (consequences.some((consequence) => !consequence.name.trim()))
        throw new Error('Name each consequence to reflect the injury.');
      validateHarm(
        c,
        campaign.rules,
        command.trackId,
        command.shifts,
        command.stressBox,
        consequences,
        !!command.extremeAspectId,
      );
      if (command.stressBox !== undefined) {
        c.stress[command.trackId] ??= [];
        c.stress[command.trackId].push(command.stressBox);
      }
      for (const consequence of consequences) {
        const consequenceId = id();
        c.consequences.push({
          ...consequence,
          id: consequenceId,
          recovering: false,
          incurredConflictId: campaign.play.conflictId,
        });
        const aspect = createAspect('consequence', consequence.name, c.id);
        aspect.id = consequenceId;
        aspect.freeInvokes = 1;
        aspect.freeInvokeOwnerId = command.sourceCharacterId;
        aspect.visibility = c.visibility;
        c.aspects.push(aspect);
      }
      if (command.extremeAspectId) {
        const aspect = c.aspects.find((a) => a.id === command.extremeAspectId);
        if (!aspect || aspect.kind === 'highConcept' || !command.extremeName?.trim())
          throw new Error('Replace a non-high-concept aspect with the named extreme consequence.');
        aspect.name = command.extremeName;
        aspect.kind = 'consequence';
        aspect.freeInvokes = 1;
        aspect.freeInvokeOwnerId = command.sourceCharacterId;
        c.consequences.push({
          id: aspect.id,
          value: 8,
          name: command.extremeName,
          recovering: false,
          incurredConflictId: campaign.play.conflictId,
        });
        c.extremeUsed = true;
      }
      const hit = command.sourceRollId ? latestRoll(campaign, command.sourceRollId) : undefined;
      if (hit) {
        if (!hit.finalized || hit.harmResolved || hit.targetCharacterId !== c.id)
          throw new Error('Finalize the pending attack before allocating its harm.');
        const damage = hit.explanation.includes('one shift traded') ? hit.shifts - 1 : hit.shifts;
        if (damage !== command.shifts) throw new Error(`This attack inflicts ${damage} shifts.`);
        hit.harmResolved = true;
        event.roll = hit;
        if (campaign.events.find((e) => e.roll?.id === hit.id)?.visibility === 'gm') event.visibility = 'gm';
      }
      touch(c);
      event.summary = `${c.name} absorbs a ${command.shifts}-shift ${command.trackId} hit`;
      event.detail = `Stress: ${command.stressBox ?? 'none'}. Consequences: ${consequences.map((v) => `${v.name} (${v.value})`).join(', ') || 'none'}${command.extremeName ? `. Extreme: ${command.extremeName}` : ''}.`;
      break;
    }
    case 'recover': {
      const c = character!;
      const consequence = c.consequences.find((v) => v.id === command.consequenceId);
      if (!consequence) throw new Error('Consequence not found.');
      if (consequence.value === 8)
        throw new Error('Extreme consequences change at major milestones, not through ordinary recovery.');
      if (command.stage === 'start') {
        const target = consequence.value + (command.selfTreatment ? 2 : 0);
        if (command.recoveryTotal === undefined || command.recoveryTotal < target)
          throw new Error(
            `Recovery requires a successful treatment roll against +${target}, plus narrative permission.`,
          );
        if (consequence.recovering) throw new Error('Recovery has already begun.');
        consequence.recovering = true;
        consequence.recoveryStartedAt = timestamp;
        event.summary = `${c.name} begins recovery: ${consequence.name}`;
      } else {
        if (!consequence.recovering || !command.wholePeriodElapsed)
          throw new Error(
            'Recovery must begin first; confirm a whole scene (mild), session (moderate), or scenario (severe) has elapsed.',
          );
        c.consequences = c.consequences.filter((v) => v.id !== consequence.id);
        c.aspects = c.aspects.filter((a) => a.id !== consequence.id);
        event.summary = `${c.name} recovers from ${consequence.name}`;
      }
      touch(c);
      break;
    }
    case 'concede': {
      const c = character!;
      if (!campaign.play.conflictId || c.conceded || c.takenOut)
        throw new Error('This character is not able to concede an active conflict.');
      if (!command.reason.trim()) throw new Error('Record the negotiated terms of defeat.');
      if (
        activeRolls(campaign).some(
          (roll) =>
            roll.conflictId === campaign.play.conflictId &&
            roll.action === 'attack' &&
            roll.targetCharacterId === c.id &&
            (!roll.finalized || !roll.harmResolved),
        )
      )
        throw new Error(
          'The attack has already been rolled. Resolve it before conceding ahead of another action.',
        );
      const amount =
        1 +
        c.consequences.filter((consequence) => consequence.incurredConflictId === campaign.play.conflictId)
          .length;
      c.conceded = true;
      campaign.play.pendingAwards.push({
        id: id(),
        characterId: c.id,
        amount,
        boundary: 'conflict',
        reason: 'Concession',
      });
      if (c.kind !== 'pc') campaign.play.npcCarryover = (campaign.play.npcCarryover ?? 0) + amount;
      touch(c);
      event.summary = `${c.name} concedes · ${amount} Fate point${amount === 1 ? '' : 's'} after the conflict`;
      event.detail = command.reason;
      break;
    }
    case 'takenOut': {
      const c = character!;
      if (!command.reason.trim()) throw new Error('Record the outcome of being taken out.');
      c.takenOut = true;
      const hit = activeRolls(campaign)
        .reverse()
        .find((r) => r.targetCharacterId === c.id && r.action === 'attack' && !r.harmResolved);
      if (hit) {
        hit.finalized = true;
        hit.harmResolved = true;
        event.roll = hit;
      }
      touch(c);
      event.summary = `${c.name} is taken out`;
      event.detail = command.reason;
      break;
    }
    case 'useStunt': {
      const c = character!;
      const stunt = c.stunts.find((s) => s.id === command.stuntId);
      if (!stunt) throw new Error('Stunt not found.');
      if (stunt.limit !== 'none' && stunt.uses >= stunt.maxUses)
        throw new Error(`This stunt has no uses left this ${stunt.limit}.`);
      spend(campaign, c, stunt.fateCost);
      stunt.uses++;
      touch(c);
      event.summary = `${c.name} uses ${stunt.name}`;
      break;
    }
    case 'learnStunt': {
      const c = character!;
      if (!command.stunt.name.trim()) throw new Error('Name the new stunt.');
      if (c.stunts.some((stunt) => stunt.id === command.stunt.id))
        throw new Error('This stunt already exists.');
      integer(command.stunt.refreshCost, 'Refresh cost', 0, 100);
      integer(command.stunt.fateCost, 'Fate point cost', 0, 100);
      const before = deriveCharacter(c, campaign.rules).refresh;
      c.stunts.push(command.stunt);
      const after = deriveCharacter(c, campaign.rules).refresh;
      if (after < 1) throw new Error('This stunt would reduce refresh below 1.');
      if (c.creationMode === 'quick') spend(campaign, c, Math.max(0, before - after));
      touch(c);
      event.summary = `${c.name} learns ${command.stunt.name}${c.creationMode === 'quick' && after < before ? ` (−${before - after} current Fate point)` : ''}`;
      break;
    }
    case 'mobHarm': {
      const result = resolveMobHit(
        command.characterIds.map((characterId) => findCharacter(campaign, characterId)),
        campaign.rules,
        command.shifts,
      );
      for (const changed of result.characters) {
        const index = campaign.characters.findIndex((c) => c.id === changed.id);
        campaign.characters[index] = changed;
      }
      event.visibility = result.characters.every((c) => c.visibility === 'shared') ? 'shared' : 'gm';
      event.summary = `Mob takes ${command.shifts} shifts; ${result.takenOutIds.length} member${result.takenOutIds.length === 1 ? '' : 's'} taken out`;
      event.detail = `${result.characters.map((c) => `${c.name}: ${c.takenOut ? 'taken out' : 'active'}`).join('; ')}. Unspent overflow: ${result.remainingShifts}.`;
      break;
    }
    case 'nextExchange': {
      if (!campaign.play.conflictId) throw new Error('Start a conflict first.');
      if (
        activeRolls(campaign).some(
          (roll) =>
            roll.conflictId === campaign.play.conflictId &&
            (!roll.finalized || (roll.action === 'attack' && !roll.harmResolved && roll.targetCharacterId)),
        )
      )
        throw new Error('Finalize pending rolls and resolve targeted hits before the next exchange.');
      campaign.play.exchange++;
      campaign.play.actedIds = [];
      event.summary = `Exchange ${campaign.play.exchange}`;
      break;
    }
    case 'contest': {
      if (command.reset) campaign.play.contest = { name: command.name ?? 'Contest', scores: {}, target: 3 };
      else if (command.name !== undefined) campaign.play.contest.name = command.name;
      if (command.characterId) {
        integer(command.victories ?? 1, 'Victories', 0, 2);
        campaign.play.contest.scores[command.characterId] =
          (campaign.play.contest.scores[command.characterId] ?? 0) + (command.victories ?? 1);
      }
      const winners = Object.entries(campaign.play.contest.scores)
        .filter(([, score]) => score >= 3)
        .map(([characterId]) => findCharacter(campaign, characterId).name);
      event.summary = winners.length
        ? `${winners.join(', ')} wins the contest`
        : `Contest updated: ${campaign.play.contest.name}`;
      break;
    }
    case 'challenge': {
      if (command.name !== undefined) campaign.play.challenge.name = command.name;
      if (command.taskId) {
        const task = campaign.play.challenge.tasks.find((t) => t.id === command.taskId);
        if (!task) throw new Error('Challenge task not found.');
        if (command.complete !== undefined) task.complete = command.complete;
        if (command.label !== undefined) task.label = command.label;
      } else if (command.label?.trim())
        campaign.play.challenge.tasks.push({ id: id(), label: command.label, complete: false });
      event.summary = `Challenge updated: ${campaign.play.challenge.name}`;
      break;
    }
    case 'milestone': {
      let c = character!;
      if (c.kind !== 'pc') throw new Error('Player milestones apply to PCs.');
      if (!command.description.trim()) throw new Error('Describe the event that earns this milestone.');
      if (command.milestone !== 'minor') c.bankedSkillPoints++;
      if (command.milestone === 'major') {
        c.refreshAdjustment++;
        const extreme = c.consequences.find((v) => v.value === 8);
        if (extreme && command.extremeAspectName?.trim()) {
          const aspect = c.aspects.find((a) => a.id === extreme.id);
          if (aspect) {
            aspect.name = command.extremeAspectName;
            aspect.kind = 'character';
            aspect.freeInvokes = 0;
          }
          c.consequences = c.consequences.filter((v) => v.value !== 8);
          c.extremeUsed = false;
        } else if (!extreme) c.extremeUsed = false;
        if (command.highConcept?.trim()) {
          const aspect = c.aspects.find((a) => a.kind === 'highConcept');
          if (aspect) aspect.name = command.highConcept;
        }
      }
      if (command.choice) {
        const changed = applyMilestoneChoice(
          c,
          campaign.rules,
          command.choice,
          command.milestone === 'major',
        );
        Object.assign(c, changed);
      }
      c.milestones.push({
        id: id(),
        type: command.milestone,
        description: command.description,
        timestamp,
        choiceUsed: !!command.choice,
      });
      touch(c);
      event.summary = `${c.name} reaches a ${command.milestone} milestone`;
      event.detail = command.description;
      break;
    }
    case 'milestoneChoice': {
      const c = character!,
        milestone = c.milestones.find((m) => m.id === command.milestoneId);
      if (!milestone || milestone.choiceUsed) throw new Error('That milestone has no unspent minor change.');
      Object.assign(c, applyMilestoneChoice(c, campaign.rules, command.choice, milestone.type === 'major'));
      c.milestones.find((m) => m.id === milestone.id)!.choiceUsed = true;
      touch(c);
      event.summary = `${c.name} makes a milestone change`;
      break;
    }
    case 'spendSkill': {
      const c = character!;
      if (c.bankedSkillPoints < 1) throw new Error('No banked skill points remain.');
      if (!campaign.rules.skills.some((s) => s.id === command.skillId))
        throw new Error('Choose a skill in this game.');
      const rating = (c.skills[command.skillId] ?? 0) + 1;
      if (rating > campaign.rules.skillCap && !(command.raiseCap && c.milestones.at(-1)?.type === 'major'))
        throw new Error('Exceeding the skill cap requires a major milestone and an explicit cap increase.');
      c.skills[command.skillId] = rating;
      if (!supportedColumns(c.skills))
        throw new Error('This increase needs more supporting skills at lower ranks.');
      if (rating > campaign.rules.skillCap) {
        campaign.rules.skillCap = rating;
        campaign.rules.version++;
      }
      c.bankedSkillPoints--;
      touch(c);
      event.summary = `${c.name} advances ${command.skillId} to +${rating}`;
      break;
    }
    case 'correction': {
      const corrected = campaign.events.find((e) => e.id === command.eventId);
      if (!corrected || !command.reason.trim())
        throw new Error('Choose an event and describe the correction.');
      event.summary = `Correction: ${corrected.summary}`;
      event.detail = command.reason;
      event.visibility = corrected.visibility;
      event.characterId = corrected.characterId;
      break;
    }
    case 'applyDraft': {
      const c = character!;
      if (c.revision !== command.baseRevision)
        throw new Error(
          'This character changed after the draft began. Review and rebase the changed fields.',
        );
      const fields = ['description', 'notes', 'extras'] as const;
      if (Object.keys(command.changes).some((key) => !fields.includes(key as (typeof fields)[number])))
        throw new Error('Drafts may only propose narrative fields.');
      for (const field of fields) {
        const value = command.changes[field];
        if (value !== undefined) {
          if (typeof value !== 'string' || value.length > 100_000)
            throw new Error('Draft text is invalid or too long.');
          c[field] = value;
        }
      }
      touch(c);
      event.summary = `Accepted narrative draft for ${c.name}`;
      break;
    }
    case 'moveToken': {
      if (![command.x, command.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1))
        throw new Error('Map positions must be finite normalized coordinates between 0 and 1.');
      const map = campaign.maps.find((m) => m.id === command.mapId);
      const revision = map?.revisions.find((r) => r.id === command.revisionId);
      const token = revision?.tokens.find((t) => t.id === command.tokenId);
      if (!map || !revision || !token) throw new Error('Map token not found.');
      if (command.zoneId && !revision.zones.some((zone) => zone.id === command.zoneId))
        throw new Error('Zone not found on this map revision.');
      if (actor.role === 'gm') {
        if (map.currentRevisionId !== revision.id)
          throw new Error('Switch to this map revision before moving its tokens.');
      } else {
        const owner = campaign.characters.find((c) => c.id === token.characterId);
        if (
          map.visibility !== 'shared' ||
          map.sharedRevisionId !== revision.id ||
          token.visibility !== 'shared' ||
          !owner ||
          owner.visibility !== 'shared' ||
          !actor.characterIds.includes(owner.id)
        )
          throw new Error('You may move only your own visible token on the shared map revision.');
      }
      token.x = command.x;
      token.y = command.y;
      token.zoneId = command.zoneId;
      event.visibility =
        map.visibility === 'shared' && map.sharedRevisionId === revision.id && token.visibility === 'shared'
          ? 'shared'
          : 'gm';
      event.summary = `${token.label} moves on ${map.name}${command.zoneId ? ` to ${revision.zones.find((z) => z.id === command.zoneId)!.name}` : ''}`;
      event.characterId = token.characterId;
      break;
    }
    case 'assignPlayer': {
      if (!command.memberId || command.memberId === 'gm' || !command.name.trim())
        throw new Error('A player identity and display name are required.');
      const member = campaign.members.find((m) => m.id === command.memberId);
      if (member?.role === 'gm') throw new Error('The GM identity cannot be assigned as a player.');
      const characterIds = [...new Set(command.characterIds)];
      for (const characterId of characterIds) {
        const c = findCharacter(campaign, characterId);
        if (c.kind !== 'pc' || c.visibility !== 'shared')
          throw new Error('Assign shared player characters only.');
      }
      for (const c of campaign.characters) {
        if (characterIds.includes(c.id)) {
          if (c.ownerId !== command.memberId) {
            c.ownerId = command.memberId;
            touch(c);
          }
        } else if (c.ownerId === command.memberId) {
          c.ownerId = 'gm';
          touch(c);
        }
      }
      campaign.members.forEach((m) => {
        if (m.id !== command.memberId)
          m.characterIds = m.characterIds.filter((characterId) => !characterIds.includes(characterId));
      });
      if (member) {
        member.name = command.name;
        member.characterIds = characterIds;
      } else
        campaign.members.push({ id: command.memberId, name: command.name, role: 'player', characterIds });
      event.summary = `Assigned ${characterIds.length} character${characterIds.length === 1 ? '' : 's'} to ${command.name}`;
      break;
    }
    case 'breather': {
      if (campaign.play.conflictId) throw new Error('A breather requires the conflict to have ended.');
      campaign.characters.forEach((c) => {
        c.stress = Object.fromEntries(campaign.rules.stressTracks.map((track) => [track.id, []]));
        touch(c);
      });
      event.summary = 'The characters catch their breath; stress clears, consequences remain.';
      break;
    }
    default:
      throw new Error('Unknown campaign command.');
  }
  campaign.revision++;
  campaign.updatedAt = timestamp;
  campaign.processedCommandIds.push(command.id);
  campaign.events.push({
    ...event,
    id: id(),
    commandId: command.id,
    sequence: (campaign.events.at(-1)?.sequence ?? 0) + 1,
    actorId: actor.id,
    timestamp,
  });
  return campaign;
}
