import type { ProgramHorizon, Scenarios } from "../journey-types";

export const HORIZON_MONTHS: Record<ProgramHorizon, number> = {
  PROGRAM_3M: 3,
  PROGRAM_6M: 6,
  PROGRAM_12M: 12,
};

/** P complessivo dell'orizzonte, dal motore di P. */
export const horizonP = (h: Scenarios["horizons"][number]) =>
  Math.round(
    h.gap.overall?.potential ??
      h.drivers.reduce((sum, d) => sum + d.potential, 0) /
        Math.max(1, h.drivers.length),
  );

/** R complessiva di partenza dello scenario. */
export const horizonR = (h: Scenarios["horizons"][number]) =>
  Math.round(
    h.gap.overall?.current ??
      h.drivers.reduce((sum, d) => sum + d.current, 0) /
        Math.max(1, h.drivers.length),
  );
