import {
  athleteSessionMaxAge,
  markAthleteSession,
  refreshAthleteSession,
} from './athlete-session';

type Req = Parameters<typeof refreshAthleteSession>[0];
type Res = Parameters<typeof refreshAthleteSession>[1];

describe('athlete session', () => {
  const previous = process.env.ATHLETE_SESSION_MAX_AGE_MS;
  afterEach(() => {
    if (previous === undefined) delete process.env.ATHLETE_SESSION_MAX_AGE_MS;
    else process.env.ATHLETE_SESSION_MAX_AGE_MS = previous;
  });

  it('defaults to 30 days and honours the environment', () => {
    delete process.env.ATHLETE_SESSION_MAX_AGE_MS;
    expect(athleteSessionMaxAge()).toBe(30 * 24 * 60 * 60 * 1000);
    process.env.ATHLETE_SESSION_MAX_AGE_MS = '60000';
    expect(athleteSessionMaxAge()).toBe(60000);
    process.env.ATHLETE_SESSION_MAX_AGE_MS = 'nope';
    expect(athleteSessionMaxAge()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('marks the session and extends the cookie', () => {
    const session = { cookie: { maxAge: 1000 } };
    markAthleteSession(session, new Date('2026-10-25T10:00:00Z'));
    expect(session).toEqual({
      athlete: true,
      athleteRefreshedOn: '2026-10-25',
      cookie: { maxAge: athleteSessionMaxAge() },
    });
  });

  it('refreshes an athlete session once a day only', () => {
    const next = jest.fn();
    const stale = {
      athlete: true,
      athleteRefreshedOn: '2000-01-01',
      cookie: { maxAge: 5 },
    };
    refreshAthleteSession({ session: stale } as Req, {} as Res, next);
    expect(stale.cookie.maxAge).toBe(athleteSessionMaxAge());
    expect(stale.athleteRefreshedOn).not.toBe('2000-01-01');

    const fresh = { ...stale, cookie: { maxAge: 5 } };
    refreshAthleteSession({ session: fresh } as Req, {} as Res, next);
    expect(fresh.cookie.maxAge).toBe(5);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('leaves staff sessions untouched', () => {
    const staff = { cookie: { maxAge: 5 } };
    refreshAthleteSession({ session: staff } as Req, {} as Res, jest.fn());
    expect(staff).toEqual({ cookie: { maxAge: 5 } });
  });
});
