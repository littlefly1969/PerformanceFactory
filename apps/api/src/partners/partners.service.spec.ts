import { PartnersService } from './partners.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { GeocodingService } from '../geo/geocoding.service';
import type { PlacesService } from '../geo/places.service';

const DAY_MS = 86_400_000;
const SEDE = {
  address: 'Via Roma 12',
  postalCode: '65121',
  city: 'Pescara',
  province: 'PE',
};

function setup({ configured = true } = {}) {
  const partner = {
    create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'p1',
        ...data,
        logoUpdatedAt: null,
        photoUpdatedAt: null,
      }),
    ),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const places = { configured, find: jest.fn(), locate: jest.fn() };
  const geocoding = { locate: jest.fn().mockResolvedValue(null) };
  const service = new PartnersService(
    { partner } as unknown as PrismaService,
    geocoding as unknown as GeocodingService,
    places as unknown as PlacesService,
  );
  return { service, partner, places, geocoding };
}

describe('PartnersService club location', () => {
  it('locates a new club with Google and keeps its Place ID', async () => {
    const { service, partner, places, geocoding } = setup();
    places.find.mockResolvedValue({
      placeId: 'ChIJ-club',
      latitude: 42.4,
      longitude: 14.2,
    });
    const club = await service.create({ code: 'c1', name: 'C1', ...SEDE });
    expect(club.located).toBe(true);
    expect(partner.create.mock.calls[0][0].data).toMatchObject({
      latitude: 42.4,
      longitude: 14.2,
      placeId: 'ChIJ-club',
    });
    expect(geocoding.locate).not.toHaveBeenCalled();
  });

  it('falls back to Nominatim without a key or when Google finds nothing', async () => {
    for (const configured of [false, true]) {
      const { service, partner, places, geocoding } = setup({ configured });
      places.find.mockResolvedValue(null);
      geocoding.locate.mockResolvedValue({ latitude: 1, longitude: 2 });
      await service.create({ code: 'c1', name: 'C1', ...SEDE });
      expect(places.find).toHaveBeenCalledTimes(configured ? 1 : 0);
      expect(partner.create.mock.calls[0][0].data).toMatchObject({
        latitude: 1,
        longitude: 2,
        placeId: null,
      });
    }
  });

  it('refreshes Google coordinates, clears them after 30 days, moves the others to Google', async () => {
    const { service, partner, places } = setup();
    const now = new Date('2026-10-28T00:00:00Z');
    const days = (n: number) => new Date(now.getTime() - n * DAY_MS);
    partner.findMany
      .mockResolvedValueOnce([
        { id: 'g1', placeId: 'a', geocodedAt: days(26) },
        { id: 'g2', placeId: 'b', geocodedAt: days(27) },
        { id: 'g3', placeId: 'c', geocodedAt: days(31) },
      ])
      .mockResolvedValueOnce([
        { id: 'o1', ...SEDE },
        { id: 'o2', ...SEDE, address: 'Via Sconosciuta 1' },
      ]);
    places.locate
      .mockResolvedValueOnce({ latitude: 1, longitude: 2 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    places.find
      .mockResolvedValueOnce({ placeId: 'd', latitude: 3, longitude: 4 })
      .mockResolvedValueOnce(null);
    expect(await service.refreshClubLocations(now)).toEqual({
      refreshed: 1,
      cleared: 1,
      moved: 1,
    });
    expect(partner.updateMany.mock.calls).toEqual([
      [
        {
          where: { id: 'g1', placeId: 'a', geocodedAt: days(26) },
          data: { latitude: 1, longitude: 2, geocodedAt: now },
        },
      ],
      [
        {
          where: { id: 'g3', placeId: 'c', geocodedAt: days(31) },
          data: { latitude: null, longitude: null, geocodedAt: null },
        },
      ],
      [
        {
          where: { id: 'o1', placeId: null, ...SEDE },
          data: { placeId: 'd', latitude: 3, longitude: 4, geocodedAt: now },
        },
      ],
    ]);
  });

  it('does nothing without a key', async () => {
    const { service, partner } = setup({ configured: false });
    expect(await service.refreshClubLocations()).toEqual({
      refreshed: 0,
      cleared: 0,
      moved: 0,
    });
    expect(partner.findMany).not.toHaveBeenCalled();
  });
});
