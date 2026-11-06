import { diagnosticHeaders, redactAiText } from './ai-diagnostic-redaction';
import { aiTrace, recordAiAttempt, safeModel } from './ai-telemetry';
import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

export type AiFetchOptions = {
  provider: 'openai' | 'gemini';
  model?: string;
  timeoutMs?: number;
  retries?: number;
};

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

/**
 * Quota giornaliera del provider esaurita (per esempio le 20 richieste al
 * giorno del piano gratuito Gemini): ritentare non serve fino al giorno dopo,
 * e l'atleta riceve un messaggio leggibile invece della risposta del provider.
 */
export class AiQuotaExhaustedException extends ServiceUnavailableException {
  constructor() {
    super({
      code: 'AI_QUOTA_EXHAUSTED',
      message:
        'Il nostro assistente ha raggiunto il limite di richieste per oggi. Riprova più tardi.',
    });
  }
}

const logger = new Logger('AiFetch');

/** 429 per quota giornaliera, distinto dal limite al minuto che si ritenta. */
export function isDailyQuotaError(status: number, body: string) {
  return status === 429 && /per ?day|perday|requests per day/i.test(body);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number) {
  return 1_000 * 2 ** (attempt - 1);
}

function readRetryAfterMs(header: string | null): number | null {
  if (!header) {
    return null;
  }
  const asNumber = Number(header);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.min(asNumber * 1_000, MAX_RETRY_AFTER_MS);
  }
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    if (delta > 0) {
      return Math.min(delta, MAX_RETRY_AFTER_MS);
    }
  }
  return null;
}

function envTimeoutMs(): number {
  const raw = process.env.AI_REQUEST_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

export async function aiFetch(
  url: string,
  init: RequestInit,
  options: AiFetchOptions,
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? envTimeoutMs();
  const maxAttempts = (options.retries ?? DEFAULT_RETRIES) + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = new Date();
    let recorded = false;
    let sequence: number | undefined;
    const trace = aiTrace.getStore();
    const request = trace?.diagnosticsEnabled
      ? {
          url: redactAiText(url),
          method: init.method ?? 'GET',
          headers: diagnosticHeaders(init.headers),
          body: typeof init.body === 'string' ? redactAiText(init.body) : null,
          ...(init.body != null &&
            typeof init.body !== 'string' && {
              bodyCaptureError: 'Corpo non testuale non supportato',
            }),
          timeoutMs,
          maxAttempts,
          httpAttempt: attempt,
        }
      : undefined;
    const record = (
      status: Parameters<typeof recordAiAttempt>[0]['status'],
      httpStatus: number | null = null,
    ) => {
      if (recorded) return;
      recorded = true;
      sequence = recordAiAttempt({
        provider: options.provider,
        model: safeModel(options.model),
        status,
        httpStatus,
        startedAt,
        durationMs: Date.now() - startedAt.getTime(),
        ...(request && { request, captureState: 'PENDING' }),
      });
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      record(response.ok ? 'SUCCESS' : 'HTTP_ERROR', response.status);
      if (trace?.diagnosticsEnabled && sequence)
        captureResponse(trace, sequence, response);
      if (response.ok) {
        return response;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (response.status === 429) {
        const errorText = await response
          .clone()
          .text()
          .catch(() => '');
        if (isDailyQuotaError(response.status, errorText)) {
          logger.warn(
            `AI_QUOTA_EXHAUSTED ${options.provider}: ${errorText.slice(0, 500)}`,
          );
          throw new AiQuotaExhaustedException();
        }
      }
      if (!retryable || attempt === maxAttempts) {
        const errorText = await response.text().catch(() => '');
        throw new BadRequestException(
          `Provider ${options.provider} HTTP ${response.status}: ${errorText.slice(0, 500)}`,
        );
      }

      const retryAfter = readRetryAfterMs(response.headers.get('retry-after'));
      await sleep(retryAfter ?? backoffMs(attempt));
      continue;
    } catch (error) {
      clearTimeout(timer);
      record(
        error instanceof Error && error.name === 'AbortError'
          ? 'TIMEOUT'
          : error instanceof TypeError
            ? 'NETWORK_ERROR'
            : 'UNKNOWN_ERROR',
      );
      if (
        trace?.diagnosticsEnabled &&
        sequence &&
        !trace.lastAttempt?.httpStatus
      ) {
        trace.saveResponse?.(
          sequence,
          {
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: redactAiText(error.message),
                    stack: redactAiText(error.stack ?? ''),
                  }
                : redactAiText(String(error)),
          },
          'NO_RESPONSE',
        );
      }
      if (
        error instanceof BadRequestException ||
        error instanceof AiQuotaExhaustedException
      ) {
        throw error;
      }
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const isNetwork = error instanceof TypeError;
      if (!isAbort && !isNetwork) {
        throw error;
      }
      if (attempt === maxAttempts) {
        const reason = isAbort
          ? `timeout dopo ${timeoutMs}ms`
          : 'errore di rete';
        throw new BadRequestException(
          `Provider ${options.provider} non raggiungibile (${reason})`,
        );
      }
      await sleep(backoffMs(attempt));
    }
  }

  throw new BadRequestException(
    `Provider ${options.provider} non raggiungibile dopo ${maxAttempts} tentativi`,
  );
}

/** Tee the body, without awaiting diagnostics or consuming the caller's Response. */
function captureResponse(
  trace: NonNullable<ReturnType<typeof aiTrace.getStore>>,
  sequence: number,
  response: Response,
) {
  try {
    const headers = diagnosticHeaders(response.headers);
    const capture = response
      .clone()
      .text()
      .then(
        (body) => {
          trace.saveResponse?.(
            sequence,
            {
              status: response.status,
              statusText: response.statusText,
              headers,
              body: redactAiText(body),
            },
            'CAPTURED',
          );
        },
        (error: unknown) => {
          trace.saveResponse?.(
            sequence,
            {
              status: response.status,
              headers,
              captureError: redactAiText(
                error instanceof Error ? error.message : String(error),
              ),
            },
            'FAILED',
          );
        },
      );
    trace.trackCapture?.(capture);
  } catch (error) {
    trace.saveResponse?.(
      sequence,
      {
        captureError: redactAiText(
          error instanceof Error ? error.message : String(error),
        ),
      },
      'FAILED',
    );
  }
}
