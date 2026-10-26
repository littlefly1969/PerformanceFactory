import { globalR } from './athlete-profile';

describe('global R', () => {
  const scale = { min: 0, max: 100 };

  it('weighs the drivers by their confidence instead of averaging them', () => {
    const r = globalR(
      [
        { score: 90, confidence: 80 },
        { score: 50, confidence: 20 },
      ],
      30,
      scale,
    )!;
    expect(r.value).toBe(82);
    expect(r).toMatchObject({ low: 68, high: 96, confidence: 30 });
  });

  it('narrows the range as the overall confidence grows, within the scale', () => {
    const drivers = [{ score: 95, confidence: 90 }];
    expect(globalR(drivers, 100, scale)).toMatchObject({ low: 95, high: 95 });
    expect(globalR(drivers, 0, scale)).toMatchObject({ low: 75, high: 100 });
    expect(globalR([], 50, scale)).toBeNull();
  });
});
