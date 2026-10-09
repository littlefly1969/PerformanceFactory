import { revealGaps } from './reveal-gap';

describe('revealGaps', () => {
  it('averages the drivers and isolates the technical-tactical one', () => {
    expect(
      revealGaps([
        { areaName: 'Tecnico-tattica', current: 40, potential: 55.25 },
        { areaName: 'Nutrizione', current: 60, potential: 65 },
      ]),
    ).toEqual({
      overall: { current: 50, potential: 60.1, gap: 10.1 },
      technicalTactical: { current: 40, potential: 55.3, gap: 15.3 },
    });
  });

  it('never invents a technical-tactical gap', () => {
    expect(
      revealGaps([{ areaName: 'Nutrizione', current: 60, potential: 60 }]),
    ).toEqual({
      overall: { current: 60, potential: 60, gap: 0 },
      technicalTactical: null,
    });
    expect(revealGaps([])).toEqual({ overall: null, technicalTactical: null });
  });
});
