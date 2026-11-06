export type Visibility = 'shared' | 'gm';
export type InventoryVisibility = Visibility | 'character';
export type Action = 'overcome' | 'advantage' | 'attack' | 'defend';
export type Outcome = 'failure' | 'tie' | 'success' | 'style';
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  actions: Action[];
}
export interface StressTrackDefinition {
  id: string;
  name: string;
  skillId: string;
  boxes: number[];
}
export interface RuleSetDefinition {
  id: string;
  version: number;
  name: string;
  contentVersion: string;
  aspectCount: number;
  phaseCount: number;
  skillCap: number;
  allocation: 'pyramid' | 'columns';
  skillSlots: Record<string, number>;
  refresh: number;
  freeStunts: number;
  stressTracks: StressTrackDefinition[];
  consequenceSlots: number[];
  skills: SkillDefinition[];
  houseRules: string;
}
export interface Aspect {
  id: string;
  name: string;
  kind: 'highConcept' | 'trouble' | 'character' | 'game' | 'situation' | 'consequence' | 'boost';
  freeInvokes: number;
  ownerId?: string;
  freeInvokeOwnerId?: string;
  visibility: Visibility;
}
export interface Stunt {
  id: string;
  name: string;
  description: string;
  refreshCost: number;
  fateCost: number;
  limit: 'none' | 'scene' | 'conflict' | 'session';
  uses: number;
  maxUses: number;
}
export interface Consequence {
  id: string;
  value: number;
  name: string;
  trackId?: string;
  recovering: boolean;
  recoveryStartedAt?: string;
  incurredConflictId?: string;
}
export interface Phase {
  id: string;
  story: string;
  characterIds: string[];
}
export interface Milestone {
  id: string;
  type: 'minor' | 'significant' | 'major';
  description: string;
  timestamp: string;
  choiceUsed?: boolean;
}
export interface Character {
  id: string;
  revision: number;
  ownerId: string;
  name: string;
  pronouns: string;
  description: string;
  kind: 'pc' | 'nameless' | 'supporting' | 'main';
  visibility: Visibility;
  status: 'draft' | 'ready';
  creationMode: 'full' | 'quick';
  aspects: Aspect[];
  phases: Phase[];
  skills: Record<string, number>;
  stunts: Stunt[];
  extras: string;
  refreshAdjustment: number;
  fatePoints: number;
  stress: Record<string, number[]>;
  consequences: Consequence[];
  milestones: Milestone[];
  bankedSkillPoints: number;
  portraitAssetId?: string;
  notes: string;
  takenOut: boolean;
  conceded: boolean;
  extremeUsed: boolean;
  npcTough?: boolean;
}
export interface Member {
  id: string;
  name: string;
  role: 'gm' | 'player';
  characterIds: string[];
}
export interface WorldEntry {
  id: string;
  kind: 'note' | 'location' | 'faction' | 'summary' | 'reference';
  title: string;
  body: string;
  visibility: Visibility;
  assetId?: string;
  tags: string[];
}
export interface InventoryItem {
  id: string;
  revision: number;
  name: string;
  quantity: number;
  unit: string;
  ownerId: string;
  description: string;
  visibility: InventoryVisibility;
}
export interface Asset {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
  hash: string;
  visibility: Visibility;
}
export interface Zone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: string;
  connections: string[];
}
export interface MapToken {
  id: string;
  characterId?: string;
  label: string;
  x: number;
  y: number;
  zoneId?: string;
  visibility: Visibility;
}
export interface MapAnnotation {
  id: string;
  text: string;
  x: number;
  y: number;
  visibility: Visibility;
}
export interface MapRevision {
  id: string;
  assetId: string;
  createdAt: string;
  zones: Zone[];
  tokens: MapToken[];
  annotations: MapAnnotation[];
}
export interface CampaignMap {
  id: string;
  name: string;
  visibility: Visibility;
  currentRevisionId: string;
  sharedRevisionId?: string;
  revisions: MapRevision[];
}
export interface RollRecord {
  id: string;
  characterId: string;
  characterName: string;
  targetCharacterId?: string;
  conflictId?: string;
  harmResolved?: boolean;
  action: Action;
  skillId: string;
  skillName: string;
  dice: number[];
  skill: number;
  modifier: number;
  opposition: number;
  total: number;
  shifts: number;
  outcome: Outcome;
  explanation: string;
  advantageExisting: boolean;
  invocations: { aspectId: string; name: string; free: boolean; bonus: number; reroll?: number[] }[];
  finalized: boolean;
}
export interface GameEvent {
  id: string;
  commandId: string;
  sequence: number;
  timestamp: string;
  actorId: string;
  type: string;
  summary: string;
  visibility: Visibility | 'character';
  /** For character-visible events, fixes the audience at the time of the event. */
  characterId?: string;
  roll?: RollRecord;
  detail?: string;
}
export interface PlayState {
  scenarioId: string;
  scenarioName: string;
  sessionId: string;
  sessionName: string;
  sceneId: string;
  sceneName: string;
  conflictId?: string;
  conflictType: 'physical' | 'mental';
  exchange: number;
  actedIds: string[];
  aspects: Aspect[];
  npcFatePoints: number;
  npcCarryover?: number;
  pendingAwards: {
    id: string;
    characterId: string;
    amount: number;
    boundary: 'scene' | 'conflict';
    reason: string;
  }[];
  contest: { name: string; scores: Record<string, number>; target: number };
  challenge: { name: string; tasks: { id: string; label: string; complete: boolean }[] };
}
export interface Campaign {
  id: string;
  revision: number;
  name: string;
  tagline: string;
  setting: string;
  scale: string;
  bannerAssetId?: string;
  bannerPosition?: number;
  kind: 'campaign' | 'one-shot';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  rules: RuleSetDefinition;
  issues: Aspect[];
  members: Member[];
  characters: Character[];
  world: WorldEntry[];
  inventory: InventoryItem[];
  assets: Asset[];
  maps: CampaignMap[];
  play: PlayState;
  events: GameEvent[];
  processedCommandIds: string[];
}
export interface ReferenceEntry {
  id: string;
  title: string;
  category: string;
  body: string;
  source: string;
  readingUrl?: string;
  sourceUrl?: string;
  sourceSection?: string;
  sourceLine?: number;
  contentVersion?: string;
  page?: number;
  tags: string[];
}
export interface CampaignExport {
  format: 'fate-core-companion';
  schemaVersion: number;
  exportedAt: string;
  audience: 'gm' | 'player';
  campaign: Campaign;
}
export interface Actor {
  id: string;
  role: 'gm' | 'player';
  characterIds: string[];
}
export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  source: string;
  sourceUrl?: string;
}
