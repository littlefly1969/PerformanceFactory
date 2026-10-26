import { giftAreas, orderClubs } from './free-lesson-gift';

describe('free lesson gift', () => {
  const areas = [
    { id: 'a', name: 'Allenamento mentale' },
    { id: 'b', name: 'Nutrizione' },
    { id: 'c', name: 'Tecnico-tattica' },
  ];

  it('marks an area Real only from the consolidation threshold up', () => {
    expect(
      giftAreas(
        areas,
        [
          { areaId: 'a', confidence: 69 },
          { areaId: 'b', confidence: 70 },
        ],
        70,
      ),
    ).toEqual([
      { id: 'a', name: 'Allenamento mentale', real: false },
      { id: 'b', name: 'Nutrizione', real: true },
      { id: 'c', name: 'Tecnico-tattica', real: false },
    ]);
  });

  it('keeps every area estimated without a threshold', () => {
    expect(
      giftAreas(areas, [{ areaId: 'a', confidence: 100 }], null).some(
        (a) => a.real,
      ),
    ).toBe(false);
  });

  it('opens the carousel with the club the athlete comes from', () => {
    const clubs = [{ id: '1' }, { id: '2' }, { id: '3' }];
    expect(orderClubs(clubs, '2').map((c) => c.id)).toEqual(['2', '1', '3']);
    expect(orderClubs(clubs, null)).toEqual(clubs);
  });
});
