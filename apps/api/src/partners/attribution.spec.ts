import { attributedCodes, normalizeCode, sanitizeTouch } from './attribution';

describe('attribution touches', () => {
  const now = new Date('2026-10-07T12:00:00Z');

  it('keeps known fields and normalizes codes', () => {
    expect(
      sanitizeTouch(
        {
          source: 'instagram',
          medium: 'social',
          campaign: 'Autunno 2026',
          club: ' Padel-Roma ',
          ref: 'AB12CD34',
          landingPath: '/start?club=padel-roma',
          at: '2026-10-07T10:00:00Z',
          email: 'leak@example.com',
        },
        now,
      ),
    ).toEqual({
      source: 'instagram',
      medium: 'social',
      campaign: 'Autunno 2026',
      club: 'padel-roma',
      ref: 'ab12cd34',
      landingPath: '/start',
      at: '2026-10-07T10:00:00.000Z',
    });
  });

  it('drops unsafe or empty values', () => {
    expect(sanitizeTouch({ source: '<script>', club: 'a' }, now)).toBeNull();
    expect(sanitizeTouch('direct', now)).toBeNull();
    expect(sanitizeTouch({ at: '2030-01-01T00:00:00Z' }, now)).toBeNull();
    expect(normalizeCode('x'.repeat(41))).toBeUndefined();
  });

  it('prefers the first touch for club and referral', () => {
    expect(
      attributedCodes(
        { club: 'first', ref: 'r1' },
        { club: 'last', ref: 'r2' },
      ),
    ).toEqual({ club: 'first', ref: 'r1' });
    expect(attributedCodes({ source: 'google' }, { club: 'last' })).toEqual({
      club: 'last',
      ref: undefined,
    });
  });
});
