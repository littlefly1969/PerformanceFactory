export type ConsentDocument = {
  type: string;
  version: string;
  title: string;
  summary: string;
  body: string[];
  documentHash: string;
};
export type Driver = {
  id: string;
  name: string;
  current: number;
  potential: number;
  gap: number;
};
export type Journey = {
  phase:
    | "CONSENTS"
    | "ASSESSMENT_INTRO"
    | "ASSESSMENT_UNAVAILABLE"
    | "ASSESSMENT"
    | "PROCESSING"
    | "RESULT"
    | "DURATION"
    | "COMPLETE";
  nextStep: string;
  firstName?: string | null;
  /** Prova mostrata all'atleta, calcolata dal backend. */
  trial?: { days: number; daysLeft: number };
  currentQuestion: number;
  /** Tutte le risposte date: confine prima del passo successivo. */
  assessmentComplete?: boolean;
  /** Totale prodotto dal backend: la UI non conosce aree ne formula. */
  count: number;
  estimatedMinutes: number;
  documents?: ConsentDocument[];
  driverList: { id: string; name: string; count: number }[];
  answers: Record<string, string | number>;
  questions: {
    id: string;
    kind?: "OPERATIONAL" | "AREA";
    /** Etichetta mostrata sopra la domanda: Disponibilità o nome del driver. */
    section?: string;
    title: string;
    areaId: string | null;
    areaName: string | null;
    options: { value: string | number; label: string }[];
  }[];
  result: {
    snapshotId: string;
    current: number;
    potential: number;
    gap: number;
    drivers: Driver[];
    priority: Driver;
  } | null;
  durationOptions: { weeks: number; label: string; description: string }[];
  programDurationWeeks: number | null;
};
