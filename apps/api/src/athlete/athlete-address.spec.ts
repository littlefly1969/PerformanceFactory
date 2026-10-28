import { BadRequestException, ConflictException } from '@nestjs/common';
import { AddressSource } from '@prisma/client';
import { readSelection, signSelection } from './address-selection';
import { AthleteAddressService } from './athlete-address';
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

  it('refreshes Google coordinates and drops them after 30 days without a refresh', async () => {
    const { service, userAddress, places } = setup();
    const now = new Date('2026-10-28T00:00:00Z');
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    userAddress.findMany.mockResolvedValue([
      { userId: 'fresh', placeId: 'p1', geocodedAt: days(26) },
      { userId: 'retry', placeId: 'p2', geocodedAt: days(27) },
      { userId: 'old', placeId: 'p3', geocodedAt: days(31) },
    ]);
    places.locate
      .mockResolvedValueOnce({ latitude: 1, longitude: 2 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    expect(await service.refreshProviderLocations(now)).toEqual({
      refreshed: 1,
      cleared: 1,
    });
    expect(userAddress.update).toHaveBeenCalledWith({
      where: { userId: 'fresh' },
      data: { latitude: 1, longitude: 2, geocodedAt: now },
    });
    expect(userAddress.update).toHaveBeenCalledWith({
      where: { userId: 'old' },
      data: { latitude: null, longitude: null, geocodedAt: null },
    });
    expect(userAddress.update).toHaveBeenCalledTimes(2);
  });
});
