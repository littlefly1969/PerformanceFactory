import { isFeatureEnabled, rolloutBucket } from './feature-flags';

const flag = (over: Partial<Parameters<typeof isFeatureEnabled>[0]> = {}) => ({
  key: 'referral_share',
  enabled: true,
  betaTesters: true,
  rolloutPercent: 0,
  ...over,
});

describe('feature flag evaluation', () => {
  const athlete = { userId: 'user-1', isBetaTester: false };
  const tester = { userId: 'user-2', isBetaTester: true };

  it('keeps a disabled flag off for everyone, testers included', () => {
    expect(isFeatureEnabled(flag({ enabled: false }), tester)).toBe(false);
    expect(
      isFeatureEnabled(flag({ enabled: false, rolloutPercent: 100 }), null),
    ).toBe(false);
  });

  it('opens a beta flag only to testers', () => {
    expect(isFeatureEnabled(flag(), tester)).toBe(true);
    expect(isFeatureEnabled(flag(), athlete)).toBe(false);
    expect(isFeatureEnabled(flag({ betaTesters: false }), tester)).toBe(false);
  });

  it('opens a 100% rollout to visitors too', () => {
    expect(isFeatureEnabled(flag({ rolloutPercent: 100 }), null)).toBe(true);
    expect(isFeatureEnabled(flag({ rolloutPercent: 99 }), null)).toBe(false);
  });

  it('uses a stable bucket so a partial rollout does not flicker', () => {
    const bucket = rolloutBucket('referral_share', 'user-1');
    expect(rolloutBucket('referral_share', 'user-1')).toBe(bucket);
    expect(isFeatureEnabled(flag({ rolloutPercent: bucket }), athlete)).toBe(
      false,
    );
    expect(
      isFeatureEnabled(flag({ rolloutPercent: bucket + 1 }), athlete),
    ).toBe(true);
  });

  it('spreads users roughly evenly across buckets', () => {
    const inside = Array.from({ length: 2000 }, (_, i) =>
      rolloutBucket('referral_share', `user-${i}`),
    ).filter((bucket) => bucket < 30).length;
    expect(inside).toBeGreaterThan(500);
    expect(inside).toBeLessThan(700);
  });
});
