import type { Journey } from "../journey-types";
import { definedAreas } from "./calibration-state";

/**
 * La lezione gratuita si sblocca solo quando è sbloccato tutto: tutte le aree
 * Reali (stessa soglia del server e dello Spider pieno). Il progresso verso lo
 * sblocco è quindi quante aree sono già Reali, non i crediti.
 */
export function lessonProgress(j: Journey) {
  const drivers = j.evaluation?.drivers ?? [];
  const real = definedAreas(j.calibration, drivers).size;
  const total = drivers.length;
  return {
    real,
    total,
    value: total ? Math.round((real / total) * 100) : 0,
    label: `${real}/${total}`,
    title: `Rendi Reali tutte e ${total === 6 ? "sei" : total} le aree per sbloccarla.`,
  };
}
