import { aiBusinessContext } from './ai-diagnostic-context';
import { diagnosticError } from './ai-diagnostic-redaction';
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
  request?: unknown;
  captureState?: string;
};
export type AiTrace = {
  sequence: number;
  validationFailures: number;
  validationCodes: Set<string>;
  lastAttempt?: HttpAttempt;
  diagnosticsEnabled?: boolean;
  diagnosticSequence?: number;
  saveEvent?: (event: {
    sequence: number;
    attemptSequence: number | null;
    phase: string;
    detail: unknown;
    createdAt: Date;
  }) => void;
  trackCapture?: (capture: Promise<void>) => void;
  saveResponse?: (sequence: number, response: unknown, state: string) => void;
  saveAttempt: (attempt: HttpAttempt) => void;
};
export const aiTrace = new AsyncLocalStorage<AiTrace>();

/** Only call when a response was received but failed domain validation. */
export function recordAiValidationFailure(
  problems: string[] = [],
  detail?: unknown,
) {
  const trace = currentAiTrace();
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
    ['SCHEDULE', /calendario|frequenza|disponibilità|finestra|giorno/i],
  ];
  let matched = false;
  for (const [code, pattern] of patterns) {
    if (problems.some((p) => pattern.test(p))) {
      trace.validationCodes.add(code);
      matched = true;
    }
  }
  if (!matched) trace.validationCodes.add('STRUCTURE');
  recordAiDiagnostic('VALIDATION', {
    problems,
    ...(detail !== undefined && { detail }),
  });
}

export function recordAiAttempt(
  attempt: Omit<HttpAttempt, 'sequence'> & {
    request?: unknown;
    captureState?: string;
  },
) {
  const trace = aiTrace.getStore();
  if (!trace) return;
  const entry = { ...attempt, sequence: ++trace.sequence };
  trace.lastAttempt = entry;
  trace.saveAttempt(entry);
  return entry.sequence;
}

/** Model names are configuration, never copy arbitrary provider payloads. */
export function safeModel(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9._/:-]{1,120}$/.test(value)
    ? value
    : null;
}

export function currentAiTrace() {
  return aiTrace.getStore() ?? aiBusinessContext.getStore()?.lastTrace;
}
export function recordAiDiagnostic(phase: string, detail: unknown) {
  const trace = currentAiTrace();
  if (!trace?.diagnosticsEnabled) return;
  trace.saveEvent?.({
    sequence: (trace.diagnosticSequence = (trace.diagnosticSequence ?? 0) + 1),
    attemptSequence: trace.lastAttempt?.sequence ?? null,
    phase,
    detail,
    createdAt: new Date(),
  });
}
export function recordAiError(
  error: unknown,
  phase = 'ERROR',
  context?: unknown,
) {
  if (!currentAiTrace()?.diagnosticsEnabled) return;
  recordAiDiagnostic(phase, {
    ...diagnosticError(error),
    ...(context !== undefined && { context }),
  });
}
