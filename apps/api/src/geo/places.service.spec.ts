import { ServiceUnavailableException } from '@nestjs/common';
import {
  AUTOCOMPLETE_FIELD_MASK,
  DETAILS_FIELD_MASK,
  SEARCH_FIELD_MASK,
  PlacesService,
  readPlace,
  readSuggestions,
} from './places.service';

const component = (
  types: string[],
  longText: string,
  shortText = longText,
) => ({
  types,
  longText,
  shortText,
});

const PLACE = {
  id: 'ChIJ-place',
  formattedAddress: 'Via Roma, 12, 67100 L’Aquila AQ, Italia',
  location: { latitude: 42.35, longitude: 13.4 },
  addressComponents: [
    component(['street_number'], '12'),
    component(['route'], 'Via Roma'),
    component(['locality', 'political'], 'L’Aquila'),
    component(['administrative_area_level_2'], 'Provincia dell’Aquila', 'AQ'),
    component(['country', 'political'], 'Italia', 'IT'),
    component(['postal_code'], '67100'),
  ],
};

const without = (type: string) => ({
  ...PLACE,
  addressComponents: PLACE.addressComponents.filter(
    (c) => !c.types.includes(type),
  ),
});

describe('readPlace', () => {
  it('normalises a complete Italian street address', () => {
    expect(readPlace(PLACE)).toEqual({
      complete: true,
      place: {
        placeId: 'ChIJ-place',
        formattedAddress: PLACE.formattedAddress,
        street: 'Via Roma 12',
        postalCode: '67100',
        city: 'L’Aquila',
        province: 'AQ',
        latitude: 42.35,
        longitude: 13.4,
      },
    });
  });

  it('never invents a missing house number, postcode or province', () => {
    expect(readPlace(without('street_number'))).toMatchObject({
      complete: false,
      missing: ['STREET_NUMBER'],
    });
    expect(readPlace(without('postal_code'))).toMatchObject({
      complete: false,
      missing: ['POSTAL_CODE'],
    });
    expect(readPlace(without('administrative_area_level_2'))).toMatchObject({
      complete: false,
      missing: ['PROVINCE'],
    });
  });

  it('treats a town alone, a foreign place or a place without location as incomplete', () => {
    const town = {
      id: 'ChIJ-town',
      formattedAddress: '67100 L’Aquila AQ, Italia',
      location: PLACE.location,
      addressComponents: PLACE.addressComponents.filter(
        (c) => !c.types.includes('route') && !c.types.includes('street_number'),
      ),
    };
    expect(readPlace(town)).toMatchObject({
      complete: false,
      missing: ['STREET', 'STREET_NUMBER'],
    });
    const foreign = {
      ...PLACE,
      addressComponents: PLACE.addressComponents.map((c) =>
        c.types.includes('country')
          ? component(['country'], 'France', 'FR')
          : c,
      ),
    };
    expect(readPlace(foreign)).toMatchObject({ missing: ['COUNTRY'] });
    expect(readPlace({ ...PLACE, location: undefined })).toMatchObject({
      missing: ['LOCATION'],
    });
    expect(readPlace(null)).toMatchObject({ complete: false });
  });
});

describe('readSuggestions', () => {
  it('keeps place predictions with id and text, five at most', () => {
    const prediction = (i: number) => ({
      placePrediction: {
        placeId: `p${i}`,
        text: { text: `Via Roma ${i}, L’Aquila` },
        structuredFormat: {
          mainText: { text: `Via Roma ${i}` },
          secondaryText: { text: 'L’Aquila AQ, Italia' },
        },
      },
    });
    const payload = {
      suggestions: [
        { queryPrediction: { text: { text: 'via roma' } } },
        ...[1, 2, 3, 4, 5, 6].map(prediction),
      ],
    };
    const rows = readSuggestions(payload);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      placeId: 'p1',
      text: 'Via Roma 1, L’Aquila',
      mainText: 'Via Roma 1',
      secondaryText: 'L’Aquila AQ, Italia',
    });
    expect(readSuggestions({})).toEqual([]);
  });
});

describe('PlacesService', () => {
  const env = { ...process.env };
  const fetchMock = jest.fn();
  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = 'server-key';
    delete process.env.GOOGLE_PLACES_ENABLED;
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    process.env = env;
  });

  it('is off without a key or when disabled', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const service = new PlacesService();
    expect(service.configured).toBe(false);
    await expect(
      service.suggest('via roma', 'token-1234567890ab'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    process.env.GOOGLE_PLACES_API_KEY = 'server-key';
    process.env.GOOGLE_PLACES_ENABLED = 'false';
    expect(new PlacesService().configured).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the session token, the Italian restriction and a field mask', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ suggestions: [] })),
    );
    await new PlacesService().suggest('via roma 12', 'token-1234567890ab');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('server-key');
    expect(headers['x-goog-fieldmask']).toBe(AUTOCOMPLETE_FIELD_MASK);
    expect(JSON.parse(init.body as string)).toMatchObject({
      input: 'via roma 12',
      sessionToken: 'token-1234567890ab',
      includedRegionCodes: ['it'],
    });
  });

  it('resolves the choice with the same session token and only the needed fields', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(PLACE)));
    const result = await new PlacesService().resolve(
      'ChIJ-place',
      'token-1234567890ab',
    );
    expect(result.complete).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/places/ChIJ-place?');
    expect(url).toContain('sessionToken=token-1234567890ab');
    expect((init.headers as Record<string, string>)['x-goog-fieldmask']).toBe(
      DETAILS_FIELD_MASK,
    );
  });

  it('turns provider errors and timeouts into an unavailable service', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await expect(
      new PlacesService().suggest('via roma', 'token-1234567890ab'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    process.env.GOOGLE_PLACES_TIMEOUT_MS = '5';
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          ),
        ),
    );
    await expect(
      new PlacesService().resolve('ChIJ-place', 'token-1234567890ab'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    delete process.env.GOOGLE_PLACES_TIMEOUT_MS;
  });

  it('refreshes a location without a session, null when it fails', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ location: { latitude: 1, longitude: 2 } })),
    );
    expect(await new PlacesService().locate('ChIJ-place')).toEqual({
      latitude: 1,
      longitude: 2,
    });
    fetchMock.mockRejectedValueOnce(new Error('down'));
    expect(await new PlacesService().locate('ChIJ-place')).toBeNull();
  });

  it('finds a club address with an ID-only text search, then its location', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ places: [{ id: 'ChIJ-club' }] })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ location: { latitude: 42.4, longitude: 14.2 } }),
        ),
      );
    const address = {
      street: 'Via Roma 12',
      postalCode: '65121',
      city: 'Pescara',
      province: 'PE',
    };
    expect(await new PlacesService().find(address)).toEqual({
      placeId: 'ChIJ-club',
      latitude: 42.4,
      longitude: 14.2,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect((init.headers as Record<string, string>)['x-goog-fieldmask']).toBe(
      SEARCH_FIELD_MASK,
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      textQuery: 'Via Roma 12, 65121 Pescara, PE, Italia',
      regionCode: 'it',
      pageSize: 1,
    });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({})));
    expect(await new PlacesService().find(address)).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    expect(await new PlacesService().find(address)).toBeNull();
  });
});
