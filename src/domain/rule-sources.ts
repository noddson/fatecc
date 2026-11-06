import sourceMetadata from '../content/source-metadata.json';
import { coreReadingUrl } from '../content/reading-links';

export const CORE_RULE_SOURCE_URL = sourceMetadata.sourceUrl;

// Line references belong to the pinned canonical CC-BY source, not a retail PDF
// or the repository's abridged OGL Markdown. Recheck them when updating that source.
const sections = {
  'game-creation': ['Setting Up Your Game', 404],
  'character-creation': ['Character Creation', 556],
  'high-concept': ['High Concept', 636],
  trouble: ['Trouble', 674],
  name: ['Name', 736],
  'phase-trio': ['The Phase Trio', 748],
  skills: ['Skills', 918],
  stunts: ['Stunts and Refresh', 967],
  stress: ['Stress and Consequences', 993],
  'quick-creation': ['Quick Character Creation', 1048],
  'stunts-in-play': ['Filling Stunts in Play', 1090],
  boosts: ['Boosts', 1180],
  invocations: ['Invoking Aspects', 1342],
  'free-invocations': ['Free Invocations', 1396],
  compels: ['Compelling Aspects', 1422],
  'fate-economy': ['The Fate Point Economy', 1610],
  'earning-fate': ['Earning Fate Points', 1652],
  'gm-fate': ['The GM and Fate Points', 1664],
  'skill-list': ['The Default Skill List', 1937],
  outcomes: ['The Four Outcomes', 3005],
  actions: ['The Four Actions', 3078],
  conflicts: ['Conflicts', 3464],
  initiative: ['Turn Order', 3597],
  exchanges: ['The Exchange', 3611],
  harm: ['Resolving Attacks', 3638],
  recovery: ['Recovering from a Consequence', 3734],
  extreme: ['Extreme Consequences', 3775],
  concessions: ['Conceding the Conflict', 3785],
  teamwork: ['Teamwork', 3950],
  npcs: ['Creating the Opposition', 4600],
  mobs: ['Hits and Overflow', 4674],
  advancement: ['Advancement and Change', 5432],
  'skill-columns': ['Skill Columns', 5500],
} as const;

export type CoreRuleTopic = keyof typeof sections;

export function coreRuleSource(topic: CoreRuleTopic): { label: string; url: string; sourceUrl: string } {
  const [section, line] = sections[topic];
  return {
    label: `Core SRD · ${section}`,
    url: coreReadingUrl(line),
    sourceUrl: `${CORE_RULE_SOURCE_URL}#L${line}`,
  };
}
