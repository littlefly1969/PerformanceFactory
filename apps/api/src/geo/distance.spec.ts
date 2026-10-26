import { addressQuery, readCoordinates } from './geocoding.service';
import { coordinatesOf, distanceBetween, distanceKm } from './distance';

describe('distanceKm', () => {
  it('measures the straight line between two Abruzzo towns', () => {
    // Pescara centro - L'Aquila centro: circa 80 km in linea d'aria.
    const km = distanceKm(
      { latitude: 42.4618, longitude: 14.2161 },
      { latitude: 42.3498, longitude: 13.3995 },
    );
    expect(km).toBeGreaterThan(65);
    expect(km).toBeLessThan(80);
  });

  it('is zero for the same point and symmetric', () => {
    const a = { latitude: 42.35, longitude: 13.4 };
    const b = { latitude: 42.46, longitude: 14.22 };
    expect(distanceKm(a, a)).toBe(0);
    expect(distanceKm(a, b)).toBe(distanceKm(b, a));
  });
});

describe('coordinatesOf', () => {
  it('rejects what is missing or out of scale', () => {
    expect(coordinatesOf({ latitude: 42.35, longitude: null })).toBeNull();
    expect(coordinatesOf({ latitude: 91, longitude: 13.4 })).toBeNull();
    expect(coordinatesOf({ latitude: 42.35, longitude: 181 })).toBeNull();
    expect(coordinatesOf({ latitude: Number.NaN, longitude: 13.4 })).toBeNull();
    expect(coordinatesOf({ latitude: 42.35, longitude: 13.4 })).toEqual({
      latitude: 42.35,
      longitude: 13.4,
    });
  });
});

describe('distanceBetween', () => {
  const club = { latitude: 42.4618, longitude: 14.2161 };

  it('is null when either side has no coordinates', () => {
    expect(distanceBetween(null, club)).toBeNull();
    expect(
      distanceBetween({ latitude: null, longitude: null }, club),
    ).toBeNull();
    expect(
      distanceBetween(club, { latitude: null, longitude: null }),
    ).toBeNull();
  });

  it('measures the distance when both sides are located', () => {
    expect(
      distanceBetween({ latitude: 42.4618, longitude: 14.2161 }, club),
    ).toBe(0);
  });
});

describe('geocoding helpers', () => {
  it('writes the address on one line, with the country', () => {
    expect(
      addressQuery({
        street: 'Via Inn 5',
        postalCode: '65015',
        city: 'Montesilvano',
        province: 'PE',
      }),
    ).toBe('Via Inn 5, 65015 Montesilvano, PE, Italia');
  });

  it('reads the first usable row and ignores the rest', () => {
    expect(readCoordinates([{ lat: '42.35', lon: '13.4' }])).toEqual({
      latitude: 42.35,
      longitude: 13.4,
    });
    expect(readCoordinates([])).toBeNull();
    expect(readCoordinates([{ lat: 'non un numero', lon: '13.4' }])).toBeNull();
    expect(readCoordinates(null)).toBeNull();
  });
});
