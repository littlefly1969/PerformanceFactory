/**
 * Regole della lezione gratuita e dei crediti di interazione (A4.8, A7.2,
 * PF-FS-PREPAYWALL §6), senza I/O. L'eleggibilità viene dalla regola di
 * confidence versionata; i crediti sono solo un elemento visivo di progresso
 * (OP-01) e i loro pesi arrivano da FreeLessonConfig.
 */
export type FreeLessonSettings = {
  creditsToUnlock: number;
  creditsInitialAssessment: number;
  creditsCalibrationRound: number;
  creditsMicroTest: number;
};

export const DEFAULT_FREE_LESSON_SETTINGS: FreeLessonSettings = {
  creditsToUnlock: 100,
  creditsInitialAssessment: 30,
  creditsCalibrationRound: 20,
  creditsMicroTest: 10,
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
  | 'DECLINED'
  | 'REQUESTED'
  | 'ASSIGNED'
  | 'ATTENDED'
  | 'NO_SHOW'
  | 'CLOSED';

/**
 * PROFILE: una segnalazione interna aperta sospende la lezione; l'atleta legge
 * solo «Continuiamo a conoscere il tuo profilo» (§5.3, §12).
 */
export type MissingRequirement = 'LEVEL' | 'CONFIDENCE' | 'PROFILE';

/**
 * Due verifiche distinte (PF-FS-PREPAYWALL §6.2). Eleggibilità dell'atleta:
 * livello stimato, per comporre il gruppo, e regola di eleggibilità della
 * lezione soddisfatta. Erogabilità: almeno un circolo che offre la lezione;
 * il posto si verifica quando l'admin lo assegna. I crediti non contano. Il
 * posto già richiesto o usato decide la fase prima delle condizioni; ritiro e
 * rinuncia restano reversibili finché R è aperta.
 */
export function lessonEligibility(input: {
  calibrationStatus: string | null;
  eligibilityMet: boolean;
  clubs: number;
  seatStatus: string | null;
  declined: boolean;
  /** Segnalazione HIGH aperta: mai un posto già richiesto o assegnato. */
  suspended?: boolean;
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
  if (!input.eligibilityMet) missing.push('CONFIDENCE');
  if (missing.length) return { phase: 'LOCKED', missing };
  if (input.suspended) return { phase: 'LOCKED', missing: ['PROFILE'] };
  // Territorio non servito: nessuna promessa, R e paywall proseguono (AT-16).
  if (input.clubs === 0) return { phase: 'UNAVAILABLE', missing: [] };
  if (input.declined || seatStatus === 'WITHDRAWN')
    return { phase: 'DECLINED', missing: [] };
  return { phase: 'ELIGIBLE', missing: [] };
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

/** Parametri coerenti: interi non negativi. */
export function freeLessonSettingsProblems(s: FreeLessonSettings) {
  const problems: string[] = [];
  if (Object.values(s).some((v) => !Number.isInteger(v) || v < 0))
    problems.push('I parametri devono essere interi non negativi');
  return problems;
}
