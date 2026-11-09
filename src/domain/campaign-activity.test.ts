import { describe, expect, it } from 'vitest';
import { lastPlayedAt, relativePlayDate } from './campaign-activity';
import type { GameEvent } from './types';

function event(type: string, timestamp: string): GameEvent {
  return {
    id: `${type}-${timestamp}`,
    commandId: 'command',
    sequence: 1,
    actorId: 'gm',
    type,
    timestamp,
    summary: '',
    visibility: 'shared',
  };
}

describe('campaign last played', () => {
  it('uses the latest valid gameplay timestamp even when imported history is out of order', () => {
    expect(
      lastPlayedAt({
        events: [
          event('boundary', '2026-10-20T10:00:00Z'),
          event('roll', '2026-11-01T11:00:00Z'),
          event('invoke', '2026-10-31T12:00:00Z'),
          event('roll', 'invalid-date'),
        ],
      }),
    ).toBe('2026-11-01T11:00:00Z');
  });

  it('does not treat administrative changes or a campaign without play as a session', () => {
    const administration = ['assignPlayer', 'applyDraft', 'sheetOverride', 'correction'].map((type) =>
      event(type, '2026-11-09T12:00:00Z'),
    );
    expect(lastPlayedAt({ events: [] })).toBeUndefined();
    expect(lastPlayedAt({ events: administration })).toBeUndefined();
    expect(lastPlayedAt({ events: [event('moveToken', '2026-11-01T12:00:00Z'), ...administration] })).toBe(
      '2026-11-01T12:00:00Z',
    );
  });

  it.each([
    [0, 'today'],
    [1, '1 day ago'],
    [6, '6 days ago'],
    [7, '1 week ago'],
    [21, '3 weeks ago'],
    [30, '1 month ago'],
    [90, '3 months ago'],
    [365, '1 year ago'],
    [730, '2 years ago'],
  ])('formats %i days with the requested relative unit', (days, expected) => {
    const now = new Date(2026, 10, 9, 12);
    const played = new Date(now);
    played.setDate(played.getDate() - days);
    expect(relativePlayDate(played.toISOString(), now)).toBe(expected);
  });

  it('uses calendar dates rather than rounding elapsed hours and tolerates clock skew', () => {
    expect(relativePlayDate(new Date(2026, 10, 8, 23, 50).toISOString(), new Date(2026, 10, 9, 0, 10))).toBe(
      '1 day ago',
    );
    expect(relativePlayDate(new Date(2026, 10, 10).toISOString(), new Date(2026, 10, 9))).toBe('today');
  });
});
