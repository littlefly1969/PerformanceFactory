import {
  athleteDate,
  calendarRange,
  presentationStatus,
  sessionDay,
} from './training-sessions';
import { completedStreak } from './athlete-views';
describe('PF4 calendar semantics', () => {
  it('uses Italian calendar dates across midnight and DST', () => {
    expect(athleteDate(new Date('2026-09-19T22:30:00Z'))).toBe('2026-09-20');
    expect(athleteDate(new Date('2026-01-19T23:30:00Z'))).toBe('2026-01-20');
    expect(athleteDate(new Date('2026-03-29T01:30:00Z'))).toBe('2026-03-29');
  });
  it('distributes generated items over one seven-day cycle, including multiple per day', () => {
    const start = new Date('2026-09-19T00:00:00Z');
    expect(
      [0, 1, 2].map((i) =>
        sessionDay(start, i, 3, null).toISOString().slice(0, 10),
      ),
    ).toEqual(['2026-09-19', '2026-09-21', '2026-09-23']);
    expect(sessionDay(start, 13, 14, null).toISOString().slice(0, 10)).toBe(
      '2026-09-25',
    );
    expect(
      sessionDay(start, 1, 3, { schedule: { dayOffset: 6 } })
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-09-25');
    expect(
      sessionDay(start, 1, 3, { schedule: { dayOffset: 200 } })
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-09-21');
  });
  it('preserves day 13 only for rolling releases and rejects missing or invalid schedules', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    expect(
      sessionDay(start, 0, 7, { schedule: { dayOffset: 13 } }, 14, true)
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-10-14');
    expect(() => sessionDay(start, 0, 7, null, 14, true)).toThrow();
    expect(() =>
      sessionDay(start, 0, 7, { schedule: { dayOffset: 14 } }, 14, true),
    ).toThrow();
  });
  it.each([
    ['SCHEDULED', '2026-09-18', 'MISSED'],
    ['SKIPPED', '2026-09-18', 'SKIPPED'],
    ['COMPLETED', '2026-09-19', 'DONE'],
    ['SCHEDULED', '2026-09-19', 'TODAY'],
    ['SCHEDULED', '2026-09-20', 'SCHEDULED'],
  ])('derives %s on %s as %s', (status, date, expected) => {
    expect(presentationStatus(status, date, '2026-09-19')).toBe(expected);
  });
  it.each([
    ['2026-02-30', '2026-03-01'],
    ['2026-09-19', '2026-09-18'],
    ['2026-01-01', '2026-09-19'],
    ['invalid', '2026-09-19'],
  ])('rejects unbounded or invalid calendar queries', (from, to) =>
    expect(() => calendarRange(from, to)).toThrow(),
  );
  it('counts actual completion dates once and allows today to remain incomplete', () => {
    const dates = [
      '2026-09-18T12:00Z',
      '2026-09-18T13:00Z',
      '2026-09-17T12:00Z',
      '2026-09-15T12:00Z',
    ].map((d) => new Date(d));
    expect(completedStreak(dates, '2026-09-19')).toBe(2);
    expect(completedStreak(dates, '2026-09-20')).toBe(0);
  });
});
