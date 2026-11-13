import type { RuleSetDefinition } from './types';

export type FateSystem = 'fate-core' | 'fate-accelerated';
// Older and customized Core campaigns predate the explicit system field.
export const isAccelerated = (rules: RuleSetDefinition): boolean =>
  (rules.system ?? rules.id) === 'fate-accelerated';
export const systemId = (rules: RuleSetDefinition): FateSystem =>
  isAccelerated(rules) ? 'fate-accelerated' : 'fate-core';
export const systemName = (rules: RuleSetDefinition): string =>
  isAccelerated(rules) ? 'Fate Accelerated' : 'Fate Core';
export const ratingName = (rules: RuleSetDefinition, plural = false): string =>
  isAccelerated(rules) ? (plural ? 'Approaches' : 'Approach') : plural ? 'Skills' : 'Skill';
export const advancementCap = (rules: RuleSetDefinition): number =>
  isAccelerated(rules) ? 5 : rules.skillCap;
