export type Attempt = {
  id: string;
  sequence: number;
  provider: string;
  model: string | null;
  status: string;
  httpStatus: number | null;
  durationMs: number;
  startedAt: string;
};
export type Operation = {
  id: string;
  operation: string;
  provider: string | null;
  model: string | null;
  status: string;
  errorCode: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  validationFailures: number;
  validationCodes: string[];
  _count: { attempts: number };
};
export type Logs = {
  rows: Operation[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  counts: Record<string, number>;
  generatedAt: string;
  retentionDays: number;
};
export const OPERATIONS: Record<string, string> = {
  initial_questions: "Domande iniziali",
  calibration_questions: "Domande di calibrazione",
  micro_tests: "Micro-test",
  assessment_evaluation: "Valutazione risposte",
  potential: "Potenziale",
  cycle_proposal: "Proposta ciclo",
  training_proposal: "Proposta allenamento",
  cycle_history: "Riepilogo ciclo",
  goal_validation: "Verifica obiettivo",
  specialist_questions: "Domande specialista",
  prompt_test: "Test prompt",
};
export const STATUS: Record<string, string> = {
  SUCCESS: "Riuscita",
  ERROR: "Errore",
  RUNNING: "In corso",
  INTERRUPTED: "Senza esito",
  HTTP_ERROR: "Errore HTTP",
  TIMEOUT: "Timeout",
  NETWORK_ERROR: "Errore di rete",
  UNKNOWN_ERROR: "Errore imprevisto",
};
export const ERRORS: Record<string, string> = {
  AI_QUOTA_EXHAUSTED: "Quota giornaliera AI esaurita.",
  INITIAL_QUESTIONS_UNAVAILABLE:
    "Generazione delle domande iniziali non riuscita: verifica i tentativi sotto.",
  INVALID_ASSESSMENT_EVALUATION: "Valutazione restituita dall’AI non valida.",
  INVALID_CALIBRATION_QUESTIONS: "Domande di calibrazione non valide.",
  INVALID_MICRO_TESTS: "Micro-test restituiti dall’AI non validi.",
  INVALID_OUTPUT: "Risposta AI non conforme ai controlli.",
  OUTPUT_ERROR:
    "Risposta HTTP ricevuta, elaborazione dell’output non riuscita.",
  CONFIGURATION_OR_INTERNAL_ERROR:
    "Errore prima della chiamata al provider: verifica configurazione e log del servizio.",
  TIMEOUT: "Tempo di risposta del provider scaduto.",
  NETWORK_ERROR: "Provider non raggiungibile.",
  HTTP_ERROR:
    "Il provider ha rifiutato la richiesta o ha restituito un errore.",
  UNKNOWN_ERROR: "Errore imprevisto durante la chiamata.",
};
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
export const duration = (ms: number | null) =>
  ms === null
    ? "—"
    : `${(ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 2 })} s`;

export const VALIDATION: Record<string, string> = {
  JSON: "JSON non valido",
  OPTIONS: "Opzioni non conformi",
  SCORES: "Punteggi o scala non conformi",
  DUPLICATES: "Contenuti duplicati",
  LENGTH: "Limiti di lunghezza",
  DRIVERS: "Driver non coerenti",
  COUNT: "Numero di elementi non conforme",
  STRUCTURE: "Struttura o campi non validi",
};
