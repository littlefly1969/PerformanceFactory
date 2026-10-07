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
};
/** Prima valutazione AI: R provvisoria per driver, score e confidence separati. */
export type Evaluation = {
  id: string;
  status: string;
  source: string;
  summary: string;
  overallConfidence: number;
  /** Livello stimato e sua affidabilità; assenti nelle valutazioni precedenti. */
  level?: string | null;
  levelConfidence?: number | null;
  /** 1 = prima valutazione; le successive vengono dai round di calibrazione. */
  sequence?: number;
  scale: { min: number; max: number };
  createdAt: string;
  drivers: {
    id: string;
    name: string;
    score: number;
    confidence: number;
    rationale: string;
    evidenceGaps: string[];
    commitment?: string | null;
  }[];
};
export type ProgramHorizon = "PROGRAM_3M" | "PROGRAM_6M" | "PROGRAM_12M";
/** Scenari P3/P6/P12 a calibrazione chiusa, dal motore di P (provvisorio finché manca la Parte C). */
export type Scenarios = {
  engine: { key: string; version: string; provisional: boolean };
  scale: { min: number; max: number };
  selectedHorizon: ProgramHorizon | null;
  horizons: {
    horizon: ProgramHorizon;
    months: number;
    drivers: {
      id: string;
      name: string;
      current: number;
      potential: number;
      confidence: number;
    }[];
  }[];
};
/** Calibrazione gratuita dopo la prima valutazione (A4.3): round di domande AI. */
export type Calibration = {
  status:
    | "FREE_CALIBRATING"
    | "FREE_LEVEL_ESTIMATED"
    | "CALIBRATION_COMPLETED"
    | "PAYWALL_READY";
  day: number;
  maxDays: number;
  confidenceThreshold: number;
  completionReason:
    | "CONFIDENCE_REACHED"
    | "CLOSING_ASSESSMENT"
    | "DEADLINE_REACHED"
    | null;
  roundsCompleted: number;
  nextRoundKind: "ADAPTIVE" | "CLOSING" | null;
  nextRoundAt: string | null;
  round: {
    id: string;
    kind: "ADAPTIVE" | "CLOSING";
    status: string;
    questions: {
      id: string;
      areaId: string;
      text: string;
      options: { value: string; label: string }[];
    }[];
    answers: Record<string, string>;
  } | null;
};
export type Journey = {
  phase:
    | "CONSENTS"
    | "ASSESSMENT_INTRO"
    | "ASSESSMENT_UNAVAILABLE"
    | "ASSESSMENT"
    | "PROCESSING"
    | "EVALUATION"
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
  evaluation?: Evaluation | null;
  calibration?: Calibration | null;
  scenarios?: Scenarios | null;
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
    drivers: Driver[];
    priority: Driver;
  } | null;
  durationOptions: { weeks: number; label: string; description: string }[];
  programDurationWeeks: number | null;
};
