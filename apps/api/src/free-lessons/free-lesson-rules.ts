/**
 * Regole della lezione gratuita e dei crediti di interazione (A4.8, A7.2,
 * A8-D02 aperto), senza I/O. Soglie e pesi arrivano da FreeLessonConfig.
 */
export type FreeLessonSettings = {
  creditsToUnlock: number;
  creditsInitialAssessment: number;
  creditsCalibrationRound: number;
  creditsMicroTest: number;
  microTestsPerDay: number;
  minDaysBeforeDeadline: number;
};

export const DEFAULT_FREE_LESSON_SETTINGS: FreeLessonSettings = {
  creditsToUnlock: 100,
  creditsInitialAssessment: 30,
  creditsCalibrationRound: 20,
  creditsMicroTest: 10,
  microTestsPerDay: 2,
  minDaysBeforeDeadline: 2,
};

export type CreditAction =
  | 'INITIAL_ASSESSMENT'
  | 'CALIBRATION_ROUND'
  | 'MICRO_TEST';

export type CreditEntry = {
  action: CreditAction;
  points: number;
  sourceKey: string;
};

/**
 * Crediti maturati dalle interazioni che rendono R più affidabile. Ogni evento
 * sorgente ha una chiave stabile: il ledger lo registra una volta sola, e i
 * punti restano quelli in vigore quando è stato registrato.
 */
export function creditEntries(
  sources: {
    initialEvaluationId: string | null;
    evaluatedRoundIds: string[];
    microTestCompletionIds: string[];
  },
  settings: FreeLessonSettings,
): CreditEntry[] {
  const entries: CreditEntry[] = [];
  if (sources.initialEvaluationId)
    entries.push({
      action: 'INITIAL_ASSESSMENT',
      points: settings.creditsInitialAssessment,
      sourceKey: `assessment:${sources.initialEvaluationId}`,
    });
  for (const id of sources.evaluatedRoundIds)
    entries.push({
      action: 'CALIBRATION_ROUND',
      points: settings.creditsCalibrationRound,
      sourceKey: `round:${id}`,
    });
  for (const id of sources.microTestCompletionIds)
    entries.push({
      action: 'MICRO_TEST',
      points: settings.creditsMicroTest,
      sourceKey: `micro-test:${id}`,
    });
  return entries.filter((entry) => entry.points > 0);
}

export const SEAT_STATUSES = [
  'REQUESTED',
  'ASSIGNED',
  'ATTENDED',
  'NO_SHOW',
  'WITHDRAWN',
] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

/** Posti che occupano la lezione: contano per la capienza. */
export const OCCUPYING_SEATS: SeatStatus[] = [
  'ASSIGNED',
  'ATTENDED',
  'NO_SHOW',
];

/** Posti che hanno consumato il beneficio: 1 per atleta (A7.2). */
export const CONSUMED_SEATS: SeatStatus[] = ['ATTENDED', 'NO_SHOW'];

export type LessonPhase =
  | 'UNAVAILABLE'
  | 'LOCKED'
  | 'ELIGIBLE'
  | 'REQUESTED'
  | 'ASSIGNED'
  | 'ATTENDED'
  | 'NO_SHOW'
  | 'CLOSED';

export type MissingRequirement = 'LEVEL' | 'CREDITS' | 'CLUB';

/**
 * Eligibility del Blueprint (LEVEL_ESTIMATED + R_NOT_FINAL) più la soglia dei
 * crediti; con soglia 0 resta solo la regola del Blueprint. Il posto già
 * richiesto o usato decide la fase prima delle condizioni.
 */
export function lessonEligibility(input: {
  calibrationStatus: string | null;
  credits: number;
  creditsToUnlock: number;
  clubs: number;
  seatStatus: string | null;
}): { phase: LessonPhase; missing: MissingRequirement[] } {
  const { calibrationStatus: status, seatStatus } = input;
  const open =
    status === 'FREE_CALIBRATING' ||
    status === 'FREE_LEVEL_ESTIMATED' ||
    status === 'FREE_LESSON_VALIDATION';
  if (seatStatus === 'ATTENDED' || seatStatus === 'NO_SHOW')
    return { phase: seatStatus, missing: [] };
  if (!status) return { phase: 'UNAVAILABLE', missing: [] };
  // R chiusa: la lezione non può più pesare sulla calibrazione.
  if (!open) return { phase: 'CLOSED', missing: [] };
  if (seatStatus === 'ASSIGNED' || seatStatus === 'REQUESTED')
    return { phase: seatStatus, missing: [] };
  const missing: MissingRequirement[] = [];
  if (status === 'FREE_CALIBRATING') missing.push('LEVEL');
  if (input.credits < input.creditsToUnlock) missing.push('CREDITS');
  if (input.clubs === 0) missing.push('CLUB');
  return { phase: missing.length ? 'LOCKED' : 'ELIGIBLE', missing };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * La lezione deve lasciare al coach il tempo di inviare il feedback prima
 * della scadenza della calibrazione, quando R si chiude comunque.
 */
export function fitsCalibration(
  startsAt: Date,
  deadlineAt: Date,
  settings: Pick<FreeLessonSettings, 'minDaysBeforeDeadline'>,
) {
  return (
    startsAt.getTime() <=
    deadlineAt.getTime() - settings.minDaysBeforeDeadline * DAY_MS
  );
}

/** Esiti di un micro-test: da 2 a 6, valori unici, punteggi nella scala. */
export function microTestOptionProblems(
  options: Array<{ value: string; label: string; score: number }>,
  scale: { minScore: number; maxScore: number },
) {
  const problems: string[] = [];
  if (options.length < 2 || options.length > 6)
    problems.push('Servono da 2 a 6 esiti');
  if (new Set(options.map((o) => o.value)).size !== options.length)
    problems.push('Ogni esito deve avere un valore diverso');
  if (
    options.some(
      (o) =>
        !Number.isFinite(o.score) ||
        o.score < scale.minScore ||
        o.score > scale.maxScore,
    )
  )
    problems.push(
      `I punteggi devono stare tra ${scale.minScore} e ${scale.maxScore}`,
    );
  return problems;
}

/** Parametri coerenti: interi non negativi; 0 micro-test al giorno li spegne. */
export function freeLessonSettingsProblems(s: FreeLessonSettings) {
  const problems: string[] = [];
  if (Object.values(s).some((v) => !Number.isInteger(v) || v < 0))
    problems.push('I parametri devono essere interi non negativi');
  if (s.minDaysBeforeDeadline > 30)
    problems.push('I giorni prima della scadenza non possono superare 30');
  return problems;
}
