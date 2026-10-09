/** Nomi del driver tecnico-tattico nel catalogo delle aree (seed e alias). */
export const TECHNICAL_TACTICAL_AREAS = [
  'Tecnico-tattica',
  'Technical-Tactical',
];

export type GapDriver = {
  areaName: string;
  current: number;
  potential: number;
};

export type Gap = { current: number; potential: number; gap: number };

const round1 = (value: number) => Math.round(value * 10) / 10;

const gap = (current: number, potential: number): Gap => ({
  current: round1(current),
  potential: round1(potential),
  gap: round1(potential - current),
});

/**
 * Gap del reveal (PF-FS-PREPAYWALL §7.3): complessivo come media dei driver e
 * tecnico-tattico dal suo driver, nella scala della valutazione. Senza driver
 * tecnico-tattico il suo gap non si inventa.
 */
export function revealGaps(drivers: GapDriver[]) {
  const mean = (pick: (d: GapDriver) => number) =>
    drivers.reduce((sum, d) => sum + pick(d), 0) / drivers.length;
  const technical = drivers.find((d) =>
    TECHNICAL_TACTICAL_AREAS.includes(d.areaName),
  );
  return {
    overall: drivers.length
      ? gap(
          mean((d) => d.current),
          mean((d) => d.potential),
        )
      : null,
    technicalTactical: technical
      ? gap(technical.current, technical.potential)
      : null,
  };
}
