import { AsyncLocalStorage } from 'node:async_hooks';

export type HttpAttempt = {
  sequence: number;
  provider: string;
  model: string | null;
  status:
    | 'SUCCESS'
    | 'HTTP_ERROR'
    | 'TIMEOUT'
    | 'NETWORK_ERROR'
    | 'UNKNOWN_ERROR';
  httpStatus: number | null;
  durationMs: number;
  startedAt: Date;
};
export type AiTrace = {
  sequence: number;
  validationFailures: number;
  validationCodes: Set<string>;
  lastAttempt?: HttpAttempt;
  saveAttempt: (attempt: HttpAttempt) => void;
};
export const aiTrace = new AsyncLocalStorage<AiTrace>();

/** Only call when a response was received but failed domain validation. */
export function recordAiValidationFailure(problems: string[] = []) {
  const trace = aiTrace.getStore();
  if (!trace) return;
  trace.validationFailures++;
  // Inspect messages only to map to fixed categories; never persist the text.
  const patterns: Array<[string, RegExp]> = [
    ['JSON', /json/i],
    ['OPTIONS', /opzion/i],
    ['SCORES', /score|puntegg|scala/i],
    ['DUPLICATES', /duplic|ugual|ripet/i],
    ['LENGTH', /caratter|troppo lung|troppo cort/i],
    ['DRIVERS', /driver|areaId|area mancante/i],
    ['COUNT', /numero|conteggio|esattamente|attese/i],
  ];
  let matched = false;
  for (const [code, pattern] of patterns) {
    if (problems.some((p) => pattern.test(p))) {
      trace.validationCodes.add(code);
      matched = true;
    }
  }
  if (!matched) trace.validationCodes.add('STRUCTURE');
}

export function recordAiAttempt(attempt: Omit<HttpAttempt, 'sequence'>) {
  const trace = aiTrace.getStore();
  if (!trace) return;
  const entry = { ...attempt, sequence: ++trace.sequence };
  trace.lastAttempt = entry;
  trace.saveAttempt(entry);
}

/** Model names are configuration, never copy arbitrary provider payloads. */
export function safeModel(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9._/:-]{1,120}$/.test(value)
    ? value
    : null;
}
