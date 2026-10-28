import { BadRequestException, ConflictException } from '@nestjs/common';
import { AddressSource } from '@prisma/client';
import { readSelection, signSelection } from './address-selection';
import { AddressSearchLimiter, AthleteAddressService } from './athlete-address';
import type { PrismaService } from '../prisma/prisma.service';
import type { GeocodingService } from '../geo/geocoding.service';
import type { PlacesService, ResolvedPlace } from '../geo/places.service';

const PLACE: ResolvedPlace = {
  placeId: 'ChIJ-place',
  formattedAddress: 'Via Roma, 12, 67100 L’Aquila AQ, Italia',
  street: 'Via Roma 12',
  postalCode: '67100',
  city: 'L’Aquila',
  province: 'AQ',
  latitude: 42.35,
  longitude: 13.4,
};

describe('address selection', () => {
  it('round-trips only for the same athlete and before it expires', () => {
    const token = signSelection('u1', PLACE, 1_000);
    expect(readSelection('u1', token, 2_000)).toEqual(PLACE);
    expect(readSelection('u2', token, 2_000)).toBeNull();
    expect(readSelection('u1', token, 1_000 + 16 * 60 * 1000)).toBeNull();
  });

  it('rejects a selection whose fields were changed in the browser', () => {
    const [body, signature] = signSelection('u1', PLACE).split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body, 'base64url').toString()),
        latitude: 45.46,
      }),
    ).toString('base64url');
    expect(readSelection('u1', `${forged}.${signature}`)).toBeNull();
    expect(readSelection('u1', 'not-a-token')).toBeNull();
    expect(readSelection('u1', `${body}.${signature}.x`)).toBeNull();
  });
});

type Upsert = {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

function setup({
  configured = true,
  row = null as Record<string, unknown> | null,
} = {}) {
  const userAddress = {
    findUnique: jest.fn().mockResolvedValue(row),
    upsert: jest.fn<unknown, [Upsert]>(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  };
  const places = {
    configured,
    resolve: jest.fn(),
    suggest: jest.fn(),
    locate: jest.fn(),
  };
  const geocoding = { locate: jest.fn().mockResolvedValue(null) };
  const service = new AthleteAddressService(
    { userAddress } as unknown as PrismaService,
    geocoding as unknown as GeocodingService,
    places as unknown as PlacesService,
  );
  return { service, userAddress, places, geocoding };
}

describe('AddressSearchLimiter', () => {
  it('blocks an athlete over the limit for one minute, not the others', () => {
    const limiter = new AddressSearchLimiter();
    limiter.take('u1', 2, 0);
    limiter.take('u1', 2, 1_000);
    expect(() => limiter.take('u1', 2, 2_000)).toThrow(/Troppe ricerche/);
    expect(() => limiter.take('u2', 2, 2_000)).not.toThrow();
    expect(() => limiter.take('u1', 2, 61_000)).not.toThrow();
  });
});

describe('AthleteAddressService', () => {
  it('keeps a historic address but does not call it verified', async () => {
    const { service } = setup({
      row: {
        street: 'Via Vecchia 1',
        postalCode: '67100',
        city: 'L’Aquila',
        province: 'AQ',
        latitude: 42,
        longitude: 13,
        source: AddressSource.MANUAL,
        verifiedAt: null,
      },
    });
    expect(await service.get('u1')).toMatchObject({
      address: { street: 'Via Vecchia 1' },
      located: true,
      verified: false,
      assisted: true,
    });
  });

  it('returns a signed selection only for a complete place', async () => {
    const { service, places } = setup();
    places.resolve.mockResolvedValueOnce({ complete: true, place: PLACE });
    const done = await service.resolve('u1', {
      placeId: 'ChIJ-place',
      sessionToken: 'token-1234567890ab',
    });
    expect(done).toMatchObject({
      complete: true,
      address: { street: 'Via Roma 12', province: 'AQ' },
    });
    expect(
      readSelection('u1', (done as { selection: string }).selection),
    ).toEqual(PLACE);
    places.resolve.mockResolvedValueOnce({
      complete: false,
      missing: ['STREET_NUMBER'],
      formattedAddress: 'Via Roma, L’Aquila',
    });
    expect(
      await service.resolve('u1', {
        placeId: 'ChIJ-route',
        sessionToken: 'token-1234567890ab',
      }),
    ).not.toHaveProperty('selection');
  });

  it('saves the signed place as a verified Google address', async () => {
    const { service, userAddress } = setup();
    await service.saveSelection('u1', {
      selection: signSelection('u1', PLACE),
    });
    const { create } = userAddress.upsert.mock.calls[0][0];
    expect(create).toMatchObject({
      userId: 'u1',
      street: 'Via Roma 12',
      latitude: 42.35,
      longitude: 13.4,
      source: AddressSource.GOOGLE_PLACES,
      placeId: 'ChIJ-place',
    });
    expect(create.verifiedAt).toBeInstanceOf(Date);
  });

  it('refuses a stale or foreign selection and keeps the old address', async () => {
    const { service, userAddress } = setup();
    await expect(
      service.saveSelection('u1', { selection: signSelection('u2', PLACE) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userAddress.upsert).not.toHaveBeenCalled();
  });

  it('accepts free text only while Google Places is off', async () => {
    const input = {
      street: 'Via Roma 12',
      postalCode: '67100',
      city: 'L’Aquila',
      province: 'aq',
    };
    const on = setup();
    await expect(on.service.save('u1', input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const off = setup({ configured: false });
    await off.service.save('u1', input);
    expect(off.userAddress.upsert.mock.calls[0][0].update).toMatchObject({
      province: 'AQ',
      source: AddressSource.MANUAL,
      placeId: null,
      verifiedAt: null,
    });
  });

  /** Righe in memoria: updateMany scrive solo dove tutti i campi coincidono. */
  function store(rows: Record<string, unknown>[]) {
    const updateMany = jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const same = (a: unknown, b: unknown) =>
          a instanceof Date && b instanceof Date
            ? a.getTime() === b.getTime()
            : a === b;
        const hits = rows.filter((row) =>
          Object.entries(where).every(([k, v]) => same(row[k], v)),
        );
        hits.forEach((row) => Object.assign(row, data));
        return Promise.resolve({ count: hits.length });
      },
    );
    return updateMany;
  }

  it('refreshes Google coordinates and drops them after 30 days without a refresh', async () => {
    const { service, userAddress, places } = setup();
    const now = new Date('2026-10-28T00:00:00Z');
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    const row = (userId: string, placeId: string, age: number) => ({
      userId,
      placeId,
      source: AddressSource.GOOGLE_PLACES,
      geocodedAt: days(age),
      latitude: 9,
      longitude: 9,
    });
    const rows = [
      row('fresh', 'p1', 26),
      row('retry', 'p2', 27),
      row('old', 'p3', 31),
    ];
    userAddress.findMany.mockResolvedValue(rows.map((r) => ({ ...r })));
    const updateMany = store(rows);
    Object.assign(userAddress, { updateMany });
    places.locate
      .mockResolvedValueOnce({ latitude: 1, longitude: 2 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    expect(await service.refreshProviderLocations(now)).toEqual({
      refreshed: 1,
      cleared: 1,
    });
    expect(rows[0]).toMatchObject({
      latitude: 1,
      longitude: 2,
      geocodedAt: now,
    });
    expect(rows[1]).toMatchObject({ latitude: 9, geocodedAt: days(27) });
    expect(rows[2]).toMatchObject({ latitude: null, geocodedAt: null });
  });

  it.each([
    ['refresh', { latitude: 1, longitude: 2 }, 26],
    ['removal', null, 31],
  ])(
    'leaves alone an address saved while the %s was waiting for Google',
    async (_branch, location, age) => {
      const { service, userAddress, places } = setup();
      const now = new Date('2026-10-28T00:00:00Z');
      const row = {
        userId: 'u1',
        placeId: 'old-place',
        source: AddressSource.GOOGLE_PLACES,
        geocodedAt: new Date(now.getTime() - age * 86_400_000),
        latitude: 9,
        longitude: 9,
      };
      userAddress.findMany.mockResolvedValue([{ ...row }]);
      Object.assign(userAddress, { updateMany: store([row]) });
      let answer: (value: unknown) => void = () => {};
      places.locate.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      const running = service.refreshProviderLocations(now);
      await new Promise((r) => setImmediate(r));
      // Nel frattempo l'atleta sceglie un altro indirizzo.
      const saved = new Date(now.getTime() - 1_000);
      Object.assign(row, {
        placeId: 'new-place',
        latitude: 45,
        longitude: 7,
        geocodedAt: saved,
      });
      answer(location);
      expect(await running).toEqual({ refreshed: 0, cleared: 0 });
      expect(row).toMatchObject({
        placeId: 'new-place',
        latitude: 45,
        longitude: 7,
        geocodedAt: saved,
      });
    },
  );
});
