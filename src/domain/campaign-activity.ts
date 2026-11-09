import type { GameCommand } from './commands';
import type { Campaign } from './types';

const playEvents = new Set<GameCommand['type']>([
  'roll',
  'invoke',
  'finalizeRoll',
  'compel',
  'adjustFate',
  'boundary',
  'harm',
  'recover',
  'concede',
  'takenOut',
  'useStunt',
  'learnStunt',
  'mobHarm',
  'nextExchange',
  'contest',
  'challenge',
  'milestone',
  'milestoneChoice',
  'spendSkill',
  'storyDetail',
  'undoRoll',
  'moveToken',
  'breather',
]);

/** Preparation, assignments, sheet corrections, and archive timestamps are not evidence of play. */
export function lastPlayedAt(campaign: Pick<Campaign, 'events'>): string | undefined {
  let latest: string | undefined;
  let latestTime = -Infinity;
  for (const event of campaign.events) {
    if (!playEvents.has(event.type as GameCommand['type'])) continue;
    const timestamp = Date.parse(event.timestamp);
    if (Number.isFinite(timestamp) && timestamp > latestTime) {
      latest = event.timestamp;
      latestTime = timestamp;
    }
  }
  return latest;
}

/** Compare local calendar days so a daylight-saving transition does not change the day count. */
export function relativePlayDate(timestamp: string, now = new Date()): string {
  const date = new Date(timestamp);
  const dayIndex = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const days = Math.max(0, Math.round((dayIndex(now) - dayIndex(date)) / 86_400_000));
  if (days === 0) return 'today';
  const [amount, unit] =
    days >= 365
      ? [Math.floor(days / 365), 'year']
      : days >= 30
        ? [Math.floor(days / 30), 'month']
        : days >= 7
          ? [Math.floor(days / 7), 'week']
          : [days, 'day'];
  return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
}
