import type {
  Action,
  Character,
  Consequence,
  Outcome,
  RuleSetDefinition,
  Stunt,
  ValidationIssue,
} from './types';
import { coreRuleSource, type CoreRuleTopic } from './rule-sources';

export const LADDER: Record<number, string> = {
  '-2': 'Terrible',
  '-1': 'Poor',
  0: 'Mediocre',
  1: 'Average',
  2: 'Fair',
  3: 'Good',
  4: 'Great',
  5: 'Superb',
  6: 'Fantastic',
  7: 'Epic',
  8: 'Legendary',
};

export function deriveCharacter(character: Character, rules: RuleSetDefinition) {
  const stuntCost = character.stunts.reduce(
    (sum, stunt, index) =>
      sum + (index < rules.freeStunts ? Math.max(0, stunt.refreshCost - 1) : stunt.refreshCost),
    0,
  );
  const refresh = rules.refresh + character.refreshAdjustment - stuntCost;
  if (character.kind === 'nameless') {
    const peak = Math.max(1, ...Object.values(character.skills));
    return {
      refresh,
      stuntCost,
      tracks: [
        {
          id: 'physical',
          name: 'Stress (physical or mental)',
          boxes: peak >= 3 ? [1, 2] : peak >= 2 ? [1] : [],
          bonusMild: false,
        },
      ],
      consequenceSlots: [] as { value: number; trackId?: string }[],
    };
  }
  const tracks = rules.stressTracks.map((track) => {
    const level = character.skills[track.skillId] ?? 0;
    const extra = level >= 3 ? 2 : level >= 1 ? 1 : 0;
    const maximum = Math.max(0, ...track.boxes);
    return {
      id: track.id,
      name: track.name,
      boxes: [...track.boxes, ...Array.from({ length: extra }, (_, i) => maximum + i + 1)],
      bonusMild: level >= 5,
    };
  });
  const baseSlots =
    character.kind === 'supporting' ? (character.npcTough ? [2, 4] : [2]) : rules.consequenceSlots;
  const consequenceSlots: { value: number; trackId?: string }[] = baseSlots.map((value) => ({ value }));
  tracks.filter((t) => t.bonusMild).forEach((t) => consequenceSlots.push({ value: 2, trackId: t.id }));
  return { refresh, stuntCost, tracks, consequenceSlots };
}

export function supportedColumns(skills: Record<string, number>): boolean {
  const counts: Record<number, number> = {};
  for (const rank of Object.values(skills)) if (rank > 0) counts[rank] = (counts[rank] ?? 0) + 1;
  for (let rank = 2; rank <= Math.max(0, ...Object.values(skills)); rank++)
    if ((counts[rank] ?? 0) > (counts[rank - 1] ?? 0)) return false;
  return true;
}

export function validateCharacter(character: Character, rules: RuleSetDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (
    field: string,
    message: string,
    topic: CoreRuleTopic,
    severity: 'warning' | 'error' = 'error',
  ) => {
    const reference = coreRuleSource(topic);
    issues.push({ field, message, severity, source: reference.label, sourceUrl: reference.url });
  };
  if (!character.name.trim()) add('name', 'Give this character a name.', 'name');
  if (character.kind !== 'pc') return issues;
  const incomplete = character.status === 'draft' ? 'warning' : 'error';
  if (!character.aspects.some((a) => a.kind === 'highConcept' && a.name.trim()))
    add('aspects', 'Add a high concept.', 'high-concept', incomplete);
  if (character.creationMode === 'full') {
    if (
      character.aspects.filter(
        (a) =>
          a.name.trim() &&
          (a.kind !== 'consequence' || character.consequences.some((c) => c.id === a.id && c.value === 8)),
      ).length !== rules.aspectCount
    )
      add(
        'aspects',
        `Complete ${rules.aspectCount} character aspects, including high concept and trouble.`,
        'character-creation',
        incomplete,
      );
    if (
      rules.aspectCount >= 2 &&
      !character.extremeUsed &&
      !character.aspects.some((a) => a.kind === 'trouble' && a.name.trim())
    )
      add('aspects', 'Add a trouble aspect.', 'trouble', incomplete);
    if (character.phases.filter((p) => p.story.trim()).length < rules.phaseCount)
      add('phases', `Describe ${rules.phaseCount} backstory phases.`, 'phase-trio', incomplete);
  }
  const skillIds = new Set(rules.skills.map((s) => s.id));
  for (const [skillId, rating] of Object.entries(character.skills)) {
    if (!skillIds.has(skillId))
      add('skills', `Unknown skill: ${skillId}. Preserve or map it when changing the game rules.`, 'skills');
    if (!Number.isInteger(rating) || rating < 0 || rating > rules.skillCap)
      add('skills', `${skillId} must be a whole rating between 0 and ${rules.skillCap}.`, 'skills');
  }
  const advanced = character.milestones.some((m) => m.type !== 'minor');
  if (advanced || rules.allocation === 'columns') {
    if (!supportedColumns(character.skills))
      add(
        'skills',
        'Each skill rank must be supported by at least as many skills at the rank below it.',
        'skill-columns',
      );
  }
  if (!advanced) {
    for (const [rank, slots] of Object.entries(rules.skillSlots)) {
      const count = Object.values(character.skills).filter((v) => v === Number(rank)).length;
      if (count > slots)
        add('skills', `Only ${slots} skill${slots === 1 ? '' : 's'} may start at +${rank}.`, 'skills');
      else if (count < slots && character.creationMode === 'full')
        add(
          'skills',
          `Fill ${slots - count} remaining skill slot${slots - count === 1 ? '' : 's'} at +${rank}.`,
          'skills',
          incomplete,
        );
    }
    for (const rating of Object.values(character.skills))
      if (rating > 0 && !rules.skillSlots[String(rating)])
        add('skills', `No creation slots exist at +${rating}.`, 'skills');
  }
  if (character.creationMode === 'quick' && !Object.values(character.skills).some((rating) => rating > 0))
    add('skills', 'Choose at least your best skill to begin quick creation.', 'quick-creation', incomplete);
  const derived = deriveCharacter(character, rules);
  if (derived.refresh < 1)
    add(
      'stunts',
      'Refresh cannot fall below 1. Remove a paid stunt or adjust the game definition.',
      'stunts',
    );
  if (character.stunts.some((s) => !Number.isInteger(s.refreshCost) || s.refreshCost < 0))
    add('stunts', 'Stunt refresh costs must be non-negative integers.', 'stunts');
  if (character.fatePoints < 0 || !Number.isInteger(character.fatePoints))
    add('fatePoints', 'Fate points must be a non-negative whole number.', 'fate-economy');
  for (const track of derived.tracks) {
    const checked = character.stress[track.id] ?? [];
    if (new Set(checked).size !== checked.length || checked.some((n) => !track.boxes.includes(n)))
      add(
        'stress',
        `The marked ${track.name} stress boxes do not match this character's capacity.`,
        'stress',
      );
  }
  return issues;
}

export interface ActionResult {
  shifts: number;
  outcome: Outcome;
  explanation: string;
  freeInvokes: number;
  boost: boolean;
  damage: number;
}
export function resolveAction(
  action: Action,
  total: number,
  opposition: number,
  advantageExisting = false,
): ActionResult {
  if (!Number.isFinite(total) || !Number.isFinite(opposition))
    throw new Error('Roll totals and opposition must be finite numbers.');
  const shifts = total - opposition;
  const outcome: Outcome = shifts < 0 ? 'failure' : shifts === 0 ? 'tie' : shifts >= 3 ? 'style' : 'success';
  const table: Record<Action, Record<Outcome, string>> = {
    overcome: {
      failure: 'Fail, or succeed at a serious cost agreed by the table.',
      tie: 'Succeed at a minor cost agreed by the table.',
      success: 'Achieve your goal without a cost.',
      style: 'Achieve your goal and gain a boost.',
    },
    advantage: advantageExisting
      ? {
          failure: 'No advantage; an opponent may receive a free invocation instead.',
          tie: 'Gain one free invocation on the existing aspect.',
          success: 'Gain one free invocation on the existing aspect.',
          style: 'Gain two free invocations on the existing aspect.',
        }
      : {
          failure: 'Fail to create the aspect, or create it with a free invocation for an opponent.',
          tie: 'Create a temporary boost instead of an enduring aspect.',
          success: 'Create the aspect with one free invocation.',
          style: 'Create the aspect with two free invocations.',
        },
    attack: {
      failure: 'Inflict no harm.',
      tie: 'Inflict no harm; gain a boost.',
      success: `Inflict a ${shifts}-shift hit.`,
      style: `Inflict a ${shifts}-shift hit; optionally reduce it by one shift to gain a boost.`,
    },
    defend: {
      failure: 'The opposing action succeeds. Resolve its effects once.',
      tie: 'Deny the main action; resolve the attacker’s tie result once.',
      success: 'Prevent the opposing action.',
      style: 'Prevent the opposing action and gain a boost.',
    },
  };
  return {
    shifts,
    outcome,
    explanation: table[action][outcome],
    freeInvokes:
      action === 'advantage'
        ? outcome === 'style'
          ? 2
          : outcome === 'success' || (outcome === 'tie' && advantageExisting)
            ? 1
            : 0
        : 0,
    boost:
      (action === 'overcome' && outcome === 'style') ||
      (action === 'defend' && outcome === 'style') ||
      (action === 'attack' && outcome === 'tie') ||
      (action === 'advantage' && !advantageExisting && outcome === 'tie'),
    damage: action === 'attack' ? Math.max(0, shifts) : 0,
  };
}

/** Rejection sampling avoids the 256 % 3 bias of directly taking a byte modulo 3. */
export function rollDice(
  randomBytes: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): number[] {
  const dice: number[] = [];
  while (dice.length < 4) {
    const bytes = randomBytes(new Uint8Array(4));
    for (const byte of bytes) {
      if (byte < 255) dice.push((byte % 3) - 1);
      if (dice.length === 4) break;
    }
  }
  return dice;
}

export function initiative(characters: Character[], type: 'physical' | 'mental'): Character[] {
  const skills = type === 'physical' ? ['notice', 'athletics', 'physique'] : ['empathy', 'rapport', 'will'];
  return [...characters].sort((a, b) => {
    for (const s of skills) {
      const difference = (b.skills[s] ?? 0) - (a.skills[s] ?? 0);
      if (difference) return difference;
    }
    return a.name.localeCompare(b.name);
  });
}

export function teamworkBonus(leader: Character, helpers: Character[], skillId: string): number {
  if (new Set(helpers.map((h) => h.id)).size !== helpers.length || helpers.some((h) => h.id === leader.id))
    throw new Error('Each helper may contribute only once, and the leader cannot also help.');
  if (helpers.some((h) => (h.skills[skillId] ?? 0) < 1))
    throw new Error('A helper must have at least Average (+1) in the same skill.');
  return helpers.length;
}

export function validateHarm(
  character: Character,
  rules: RuleSetDefinition,
  trackId: string,
  shifts: number,
  stressBox: number | undefined,
  consequences: Pick<Consequence, 'value' | 'trackId'>[],
  extreme = false,
): void {
  if (!Number.isInteger(shifts) || shifts < 1) throw new Error('A hit must have at least one shift.');
  const derived = deriveCharacter(character, rules);
  const track = derived.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error('Unknown stress track.');
  if (
    stressBox !== undefined &&
    (!track.boxes.includes(stressBox) || character.stress[trackId]?.includes(stressBox))
  )
    throw new Error('Choose one available rated stress box.');
  const available = [...derived.consequenceSlots];
  for (const consequence of [...character.consequences.filter((c) => c.value !== 8), ...consequences]) {
    const index = available.findIndex(
      (slot) => slot.value === consequence.value && slot.trackId === consequence.trackId,
    );
    if (index === -1) throw new Error('That consequence slot is already occupied or unavailable.');
    available.splice(index, 1);
  }
  if (consequences.some((c) => c.trackId && c.trackId !== trackId))
    throw new Error('Restricted consequence slots must match the kind of harm.');
  if (extreme && (character.kind === 'nameless' || character.kind === 'supporting'))
    throw new Error('This NPC profile does not have an extreme consequence.');
  if (extreme && character.extremeUsed)
    throw new Error('Only one extreme consequence is available between major milestones.');
  if ((stressBox ?? 0) + consequences.reduce((n, c) => n + c.value, 0) + (extreme ? 8 : 0) < shifts)
    throw new Error('Allocate enough stress and consequences to absorb the entire hit, or be taken out.');
}

export type MilestoneChoice =
  | { kind: 'swapSkills'; first: string; second: string }
  | { kind: 'renameAspect'; aspectId: string; name: string }
  | { kind: 'replaceStunt'; stuntId: string; stunt: Stunt }
  | { kind: 'buyStunt'; stunt: Stunt };

export function applyMilestoneChoice(
  character: Character,
  rules: RuleSetDefinition,
  choice: MilestoneChoice,
  major = false,
): Character {
  const result = structuredClone(character);
  if (choice.kind === 'swapSkills') {
    if (!rules.skills.some((s) => s.id === choice.first) || !rules.skills.some((s) => s.id === choice.second))
      throw new Error('Choose skills in this game.');
    const first = result.skills[choice.first] ?? 0,
      second = result.skills[choice.second] ?? 0;
    if ((first === 0 || second === 0) && Math.max(first, second) !== 1)
      throw new Error('Only an Average (+1) skill may be replaced with an untrained skill.');
    result.skills[choice.first] = second;
    result.skills[choice.second] = first;
  } else if (choice.kind === 'renameAspect') {
    const aspect = result.aspects.find((a) => a.id === choice.aspectId);
    if (!aspect || !choice.name.trim()) throw new Error('Choose an aspect and its new wording.');
    if (aspect.kind === 'highConcept' && !major)
      throw new Error('Changing the high concept requires a major milestone.');
    aspect.name = choice.name;
  } else if (choice.kind === 'replaceStunt') {
    const index = result.stunts.findIndex((s) => s.id === choice.stuntId);
    if (index === -1) throw new Error('Choose an existing stunt.');
    result.stunts[index] = choice.stunt;
  } else result.stunts.push(choice.stunt);
  if (deriveCharacter(result, rules).refresh < 1)
    throw new Error('This choice would reduce refresh below 1.');
  return result;
}

/** Core SRD, Hits and Overflow: excess shifts carry to the next member of an ordered mob. */
export function resolveMobHit(members: Character[], rules: RuleSetDefinition, shifts: number) {
  if (!Number.isInteger(shifts) || shifts < 1)
    throw new Error('A mob hit requires a positive whole number of shifts.');
  if (!members.length || members.some((c) => c.kind !== 'nameless'))
    throw new Error('A mob consists of nameless NPCs.');
  if (new Set(members.map((c) => c.id)).size !== members.length)
    throw new Error('Each mob member may appear only once.');
  const characters = structuredClone(members),
    takenOutIds: string[] = [];
  let remainingShifts = shifts;
  for (const member of characters) {
    if (!remainingShifts || member.takenOut) continue;
    const boxes = deriveCharacter(member, rules).tracks[0].boxes.filter(
      (box) => !(member.stress.physical ?? []).includes(box),
    );
    const fittingBox = boxes.find((box) => box >= remainingShifts);
    if (fittingBox !== undefined) {
      member.stress.physical ??= [];
      member.stress.physical.push(fittingBox);
      remainingShifts = 0;
    } else {
      remainingShifts -= Math.max(0, ...boxes) + 1;
      member.takenOut = true;
      takenOutIds.push(member.id);
    }
    member.revision++;
  }
  return { characters, takenOutIds, remainingShifts };
}
