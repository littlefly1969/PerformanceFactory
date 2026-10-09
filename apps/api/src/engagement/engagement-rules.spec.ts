import { inactivityBand } from './engagement-rules';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-20T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('inactivityBand', () => {
  it('stays active up to seven days of inactivity', () => {
    expect(inactivityBand(ago(0), now)).toBe('ACTIVE');
    expect(inactivityBand(ago(7 * DAY_MS), now)).toBe('ACTIVE');
  });

  it('AT-21: is sleepy after seven days and before ten', () => {
    expect(inactivityBand(ago(7 * DAY_MS + 1), now)).toBe('SLEEPY');
    expect(inactivityBand(ago(8 * DAY_MS), now)).toBe('SLEEPY');
    expect(inactivityBand(ago(10 * DAY_MS - 1), now)).toBe('SLEEPY');
  });

  it('AT-22: is dormant at exactly ten days, a rolling 10 × 24 hours', () => {
    expect(inactivityBand(ago(10 * DAY_MS), now)).toBe('DORMANT');
    expect(inactivityBand(ago(40 * DAY_MS), now)).toBe('DORMANT');
  });
});
