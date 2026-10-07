import { BadRequestException } from '@nestjs/common';
import {
  allowedProperties,
  assertAnonymousId,
  clientEventName,
  eventTime,
  sanitizeProperties,
} from './analytics-events';

describe('analytics event validation', () => {
  it('accepts only browser events from the allowlist', () => {
    expect(clientEventName('landing_viewed')).toBe('landing_viewed');
    expect(() => clientEventName('registration_completed')).toThrow(
      BadRequestException,
    );
    expect(() => clientEventName('anything')).toThrow(BadRequestException);
  });

  it('requires a UUID anonymous id', () => {
    expect(assertAnonymousId('6F1C2D3E-1111-4222-8333-944455556666')).toBe(
      '6f1c2d3e-1111-4222-8333-944455556666',
    );
    expect(() => assertAnonymousId('user@example.com')).toThrow(
      BadRequestException,
    );
  });

  it('keeps properties flat, short and typed', () => {
    expect(
      sanitizeProperties({ source: 'x'.repeat(300), step: 3, ok: true }),
    ).toEqual({ source: 'x'.repeat(200), step: 3, ok: true });
    expect(() => sanitizeProperties({ nested: { a: 1 } })).toThrow(
      BadRequestException,
    );
    expect(() => sanitizeProperties({ 'Bad-Key': 'x' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      sanitizeProperties(
        Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i])),
      ),
    ).toThrow(BadRequestException);
  });

  it('falls back to server time for implausible device clocks', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    expect(eventTime('2026-10-07T11:59:00Z', now).toISOString()).toBe(
      '2026-10-07T11:59:00.000Z',
    );
    expect(eventTime('2027-01-01T00:00:00Z', now)).toBe(now);
    expect(eventTime('2026-01-01T00:00:00Z', now)).toBe(now);
    expect(eventTime('not a date', now)).toBe(now);
  });

  it('keeps only the properties each event allows, in their format', () => {
    expect(
      allowedProperties('landing_viewed', {
        path: '/start',
        email: 'mario@example.com',
        phone: '3331234567',
      }),
    ).toEqual({ path: '/start' });
    expect(
      allowedProperties('landing_viewed', { path: '/start?email=a@b.it' }),
    ).toEqual({});
    expect(allowedProperties('discovery_started', { name: 'Mario' })).toEqual(
      {},
    );
  });
});
