import { provisionalPotentialEngine as engine } from './potential-engine';

const input = (over: Partial<Parameters<typeof engine.compute>[0]> = {}) => ({
  scale: { min: 0, max: 100 },
  level: 'INTERMEDIATE',
  levelConfidence: 70,
  daysPerWeek: 3,
  drivers: [{ areaId: 'a', score: 40, confidence: 80, commitment: 'MEDIUM' }],
  ...over,
});

const values = (result: ReturnType<typeof engine.compute>) =>
  result.map((s) => s.value);

describe('provisional potential engine', () => {
  it('grows towards the level ceiling and slows down (no linear growth)', () => {
    const [p3, p6, p12] = values(engine.compute(input()));
    expect(p3).toBeGreaterThan(40);
    expect(p6).toBeGreaterThan(p3);
    expect(p12).toBeGreaterThan(p6);
    expect(p12).toBeLessThanOrEqual(80);
    // Il secondo trimestre rende meno del primo: curva che rallenta.
    expect(p6 - p3).toBeLessThan(p3 - 40);
  });

  it('keeps R where it is when the driver is already at the ceiling', () => {
    const result = engine.compute(
      input({
        drivers: [
          { areaId: 'a', score: 85, confidence: 80, commitment: 'HIGH' },
        ],
      }),
    );
    expect(values(result)).toEqual([85, 85, 85]);
    expect(result[0].assumptions.plateau).toBe(true);
  });

  it('grows faster with more commitment and availability', () => {
    const p12 = (commitment: string, daysPerWeek: number | null) =>
      engine.compute(
        input({
          daysPerWeek,
          drivers: [{ areaId: 'a', score: 40, confidence: 80, commitment }],
        }),
      )[2].value;
    expect(p12('HIGH', 4)).toBeGreaterThan(p12('MEDIUM', 3));
    expect(p12('MEDIUM', 3)).toBeGreaterThan(p12('LOW', 1));
    expect(p12('MEDIUM', null)).toBeLessThan(p12('MEDIUM', 3));
  });

  it('lowers confidence with the horizon and never exceeds the inputs', () => {
    const confidences = engine.compute(input()).map((s) => s.confidence);
    expect(confidences).toEqual([63, 53, 42]);
  });

  it('respects other scales', () => {
    const [p3] = engine.compute(
      input({
        scale: { min: 1, max: 10 },
        drivers: [
          { areaId: 'a', score: 4, confidence: 80, commitment: 'MEDIUM' },
        ],
      }),
    );
    expect(p3.value).toBeGreaterThan(4);
    expect(p3.assumptions.ceiling).toBeCloseTo(8.2);
  });
});
