import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { PlacesService } from '../geo/places.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAreaService, clubAreaSuggestions } from './club-area';

const CLUBS = [
  { city: 'Pescara', postalCode: '65121', province: 'PE' },
  { city: 'Pescara', postalCode: '65121', province: 'PE' },
  { city: 'Pescara', postalCode: '65129', province: 'PE' },
  { city: 'Forlì', postalCode: '47121', province: 'FC' },
  { city: 'L’Aquila', postalCode: '67100', province: 'aq' },
  { city: null, postalCode: '65100', province: null },
];

describe('clubAreaSuggestions', () => {
  it('matches postcodes by prefix, once per postcode and town', () => {
    expect(clubAreaSuggestions('651', CLUBS)).toEqual([
      {
        placeId: null,
        main: '65121',
        secondary: 'Pescara',
        area: { city: 'Pescara', postalCode: '65121', province: 'PE' },
      },
      {
        placeId: null,
        main: '65129',
        secondary: 'Pescara',
        area: { city: 'Pescara', postalCode: '65129', province: 'PE' },
      },
    ]);
    expect(clubAreaSuggestions('99', CLUBS)).toEqual([]);
  });

  it('matches towns ignoring case, accents and apostrophes', () => {
    expect(clubAreaSuggestions('FORLI', CLUBS)).toEqual([
      {
        placeId: null,
        main: 'Forlì',
        secondary: 'FC',
        area: { city: 'Forlì', postalCode: null, province: 'FC' },
      },
    ]);
    expect(clubAreaSuggestions(" l'aqu ", CLUBS)).toEqual([
      expect.objectContaining({
        main: 'L’Aquila',
        area: { city: 'L’Aquila', postalCode: null, province: 'AQ' },
      }),
    ]);
    expect(clubAreaSuggestions('pesc', CLUBS)).toHaveLength(1);
  });
});

describe('ClubAreaService', () => {
  const findMany = jest.fn().mockResolvedValue(CLUBS);
  const prisma = { partner: { findMany } } as unknown as PrismaService;
  const places = {
    configured: true,
    suggestAreas: jest.fn(),
    resolveArea: jest.fn(),
  };
  const service = () =>
    new ClubAreaService(prisma, places as unknown as PlacesService);
  const TOKEN = 'token-1234567890ab';

  beforeEach(() => {
    findMany.mockClear();
    places.configured = true;
    places.suggestAreas.mockReset();
    places.resolveArea.mockReset();
  });

  it('uses Google when configured: suggestions still to resolve', async () => {
    places.suggestAreas.mockResolvedValue([
      {
        placeId: 'ChIJ-cap',
        text: '65121 Pescara PE, Italia',
        mainText: '65121',
        secondaryText: 'Pescara PE, Italia',
      },
    ]);
    expect(await service().suggestions('u1', ' 65121 ', TOKEN)).toEqual({
      suggestions: [
        {
          placeId: 'ChIJ-cap',
          main: '65121',
          secondary: 'Pescara PE, Italia',
          area: null,
        },
      ],
    });
    expect(places.suggestAreas).toHaveBeenCalledWith('65121', TOKEN);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('falls back to the clubs when Google is off or fails', async () => {
    places.configured = false;
    expect(
      (await service().suggestions('u1', '6512', TOKEN)).suggestions,
    ).toHaveLength(2);
    expect(places.suggestAreas).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, freeLessonsEnabled: true },
      }),
    );

    places.configured = true;
    places.suggestAreas.mockRejectedValue(new ServiceUnavailableException());
    expect(await service().suggestions('u1', 'forli', TOKEN)).toEqual({
      suggestions: [expect.objectContaining({ placeId: null, main: 'Forlì' })],
    });
  });

  it('resolves a Google choice to its town', async () => {
    places.resolveArea.mockResolvedValue({
      city: 'Pescara',
      postalCode: '65121',
      province: 'PE',
    });
    expect(await service().resolve('u1', 'ChIJ-cap', TOKEN)).toEqual({
      area: { city: 'Pescara', postalCode: '65121', province: 'PE' },
    });
    expect(places.resolveArea).toHaveBeenCalledWith('ChIJ-cap', TOKEN);
  });

  it('limits each athlete’s searches per minute', async () => {
    places.configured = false;
    const limited = service();
    for (let i = 0; i < 60; i++)
      await limited.suggestions('u1', 'pescara', TOKEN);
    await expect(
      limited.suggestions('u1', 'pescara', TOKEN),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      limited.suggestions('u2', 'pescara', TOKEN),
    ).resolves.toBeDefined();
  });
});
