import { HttpException } from '@nestjs/common';

const CREDENTIAL_KEY =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[-_]?key|x-goog-api-key|x-auth-token|password|passwd|client[-_]?secret|secret|access[-_]?token|refresh[-_]?token|id[-_]?token|credentials?|private[-_]?key)$/i;
const MASK = '[CREDENTIAL REDACTED]';

/** Preserve all application data and wire formatting. Only authentication secrets are removed. */
export function redactAiText(text: string): string {
  let result = text;
  const secrets = Object.entries(process.env)
    .filter(
      ([key, value]) =>
        /(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY)$/.test(key) &&
        !!value &&
        value.length >= 8,
    )
    .map(([, value]) => value!)
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets) {
    for (const value of [
      secret,
      JSON.stringify(secret).slice(1, -1),
      encodeURIComponent(secret),
    ]) {
      result = result.split(value).join(MASK);
    }
  }
  // Mask credential values without reformatting surrounding or malformed JSON.
  result = maskTextCredentialHeaders(maskCredentialValues(result));
  return result
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_.=-]+/gi, `$1 ${MASK}`)
    .replace(
      /([?&](?:key|api_key|api-key|access_token|token)=)[^&#\s"']*/gi,
      `$1${MASK}`,
    )
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, `$1${MASK}@`)
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, MASK)
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, MASK);
}

export function redactAiValue(value: unknown): unknown {
  if (typeof value === 'string') return redactAiText(value);
  if (Array.isArray(value)) return value.map(redactAiValue);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        CREDENTIAL_KEY.test(key) ? MASK : redactAiValue(item),
      ]),
    );
  }
  return value;
}
export function diagnosticJson(value: unknown): string {
  try {
    return JSON.stringify(redactAiValue(value)) ?? 'null';
  } catch {
    return JSON.stringify({ captureError: 'Value could not be serialized' });
  }
}
export function diagnosticError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { thrown: redactAiValue(error) };
  return redactAiValue({
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error instanceof HttpException && {
      status: error.getStatus(),
      response: error.getResponse(),
    }),
    ...(error.cause !== undefined && {
      cause:
        error.cause instanceof Error
          ? {
              name: error.cause.name,
              message: error.cause.message,
              stack: error.cause.stack,
            }
          : error.cause,
    }),
  }) as Record<string, unknown>;
}
export function diagnosticHeaders(headers: HeadersInit | undefined) {
  return redactAiValue(
    Object.fromEntries(new Headers(headers).entries()),
  ) as Record<string, string>;
}

function maskCredentialValues(text: string): string {
  const field = /"((?:\\.|[^"\\])*)"\s*:/g;
  let result = '';
  let copied = 0;
  for (let match = field.exec(text); match; match = field.exec(text)) {
    let key: string;
    try {
      key = JSON.parse(`"${match[1]}"`) as string;
    } catch {
      continue;
    }
    if (!CREDENTIAL_KEY.test(key)) continue;
    let start = field.lastIndex;
    while (/\s/.test(text[start] ?? '') && start < text.length) start++;
    const end = credentialValueEnd(text, start);
    result += text.slice(copied, start) + JSON.stringify(MASK);
    copied = end;
    field.lastIndex = end;
  }
  return result + text.slice(copied);
}
function credentialValueEnd(text: string, start: number): number {
  let quoted = false;
  let escaped = false;
  let depth = 0;
  const structured = text[start] === '{' || text[start] === '[';
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') {
        quoted = false;
        if (!structured) return i + 1;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      if (!structured) return i;
      if (--depth === 0) return i + 1;
    } else if (!structured && (char === ',' || /\s/.test(char))) return i;
  }
  return text.length;
}

const TEXT_CREDENTIAL_HEADERS =
  '(?:authorization|proxy-authorization|x-api-key|api[-_]?key|x-goog-api-key|x-auth-token|cookie|set-cookie)';
function maskTextCredentialHeaders(text: string): string {
  // A real header occupies its line. Keep any separately labelled application
  // fields in malformed/mixed text, as well as literal JSON newline escapes.
  const lines = new RegExp(
    `(^|[\\r\\n])([ \\t]*${TEXT_CREDENTIAL_HEADERS}[ \\t]*:[ \\t]*)([^\\r\\n]*)`,
    'gi',
  );
  let result = text.replace(
    lines,
    (_match: string, newline: string, prefix: string, value: string) => {
      const boundary = value.search(
        /\\[rn]|[,;][ \t]*(?:\\?["'])?[\w-]+(?:\\?["'])?[ \t]*:/,
      );
      const end = boundary < 0 ? value.length : boundary;
      const credential = value.slice(0, end);
      if (!credential.trim()) return newline + prefix + value;
      const trailing = credential.match(/[ \t]*$/)![0];
      const bare = credential.slice(0, credential.length - trailing.length);
      const quote = bare.match(/^(\\?["'])/)?.[0];
      const closing = bare.match(/(\\?["'])$/)?.[0] ?? '';
      return (
        newline +
        prefix +
        (quote ?? '') +
        MASK +
        closing +
        trailing +
        value.slice(end)
      );
    },
  );
  // Credentials may also be embedded in a sentence or a response string.
  // Match only the labelled credential, leaving adjacent application data.
  const prefix =
    String.raw`(?<![\w-])` +
    `(${TEXT_CREDENTIAL_HEADERS}(?:\\\\?["'])?[ \\t]*:[ \\t]*)`;
  const escaped = new RegExp(
    prefix + String.raw`(\\["'])([^\\\r\n]*?)\2`,
    'gi',
  );
  result = result.replace(
    escaped,
    (_match: string, label: string, quote: string) =>
      label + quote + MASK + quote,
  );
  const inline = new RegExp(
    prefix +
      String.raw`(?:(Bearer|Basic|Token|ApiKey)[ \t]+)?(?:"((?:\\.|[^"\\\r\n])*)"|'((?:\\.|[^'\\\r\n])*)'|([^\s,;'"` +
      '`' +
      String.raw`<>{}\[\]\\]+))`,
    'gi',
  );
  return result.replace(
    inline,
    (
      _match: string,
      label: string,
      scheme: string | undefined,
      doubleQuoted: string | undefined,
      singleQuoted: string | undefined,
    ) => {
      const quote =
        doubleQuoted !== undefined
          ? '"'
          : singleQuoted !== undefined
            ? "'"
            : '';
      return label + (scheme ? `${scheme} ` : '') + quote + MASK + quote;
    },
  );
}
