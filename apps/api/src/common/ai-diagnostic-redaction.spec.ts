import {
  diagnosticError,
  diagnosticJson,
  redactAiText,
} from './ai-diagnostic-redaction';

const MASK = '[CREDENTIAL REDACTED]';
describe('credential headers in free text', () => {
  it.each([
    'Authorization',
    'authorization',
    'Proxy-Authorization',
    'X-Api-Key',
    'Api-Key',
    'X-Goog-Api-Key',
    'X-Auth-Token',
  ])(
    'masks %s without touching application headers or subsequent data',
    (header) => {
      const source = `${header}: token-di-prova\r\nX-Request-ID: req-42\r\nName: Mario\r\nHealth: dolore\r\n`;
      expect(redactAiText(source)).toBe(
        `${header}: ${MASK}\r\nX-Request-ID: req-42\r\nName: Mario\r\nHealth: dolore\r\n`,
      );
    },
  );
  it('masks complete cookie headers, preserving the next line', () => {
    expect(
      redactAiText(
        'Cookie: session=abc; auth=def\nSet-Cookie: session=abc; Path=/\nuserId: athlete-1',
      ),
    ).toBe(`Cookie: ${MASK}\nSet-Cookie: ${MASK}\nuserId: athlete-1`);
  });
  it('masks echoed credentials inside provider responses and errors', () => {
    const source =
      'Errore provider: Authorization: token-di-prova; userId: athlete-1, name: Mario';
    expect(redactAiText(source)).toBe(
      `Errore provider: Authorization: ${MASK}; userId: athlete-1, name: Mario`,
    );
    expect(JSON.stringify(diagnosticError(new Error(source)))).not.toContain(
      'token-di-prova',
    );
    expect(diagnosticJson({ body: source })).toContain('athlete-1');
  });
  it('preserves malformed JSON and all non-credential fields', () => {
    const source =
      '{Authorization: token-di-prova, "userId": "athlete-1", "name": "Mario", "health": "dolore", broken';
    expect(redactAiText(source)).toBe(
      `{Authorization: ${MASK}, "userId": "athlete-1", "name": "Mario", "health": "dolore", broken`,
    );
    const mixed = 'Authorization: token-di-prova, name: Mario, health: dolore';
    expect(redactAiText(mixed)).toBe(
      `Authorization: ${MASK}, name: Mario, health: dolore`,
    );
  });
  it('preserves quoted value boundaries and literal JSON newline escapes', () => {
    expect(
      redactAiText('Errore: Authorization: "token con spazi"; name: Mario'),
    ).toBe(`Errore: Authorization: "${MASK}"; name: Mario`);
    const response = JSON.stringify({
      error: 'Authorization: "token-di-prova"\nMario, dolore al ginocchio',
      name: 'Mario',
    });
    const redacted = redactAiText(response);
    expect(redacted).not.toContain('token-di-prova');
    expect(JSON.parse(redacted)).toEqual({
      error: `Authorization: "${MASK}"\nMario, dolore al ginocchio`,
      name: 'Mario',
    });
  });
  it('does not redact names, IDs, prompts, clinical data or unrelated headers', () => {
    const text =
      'Nome: Mario\nuserId: athlete-1\nAnamnesi: dolore al ginocchio\nPrompt: valuta il caso\nX-Request-ID: 42\nX-Not-Authorization: keep this useful context\nContent-Type: application/json\n{"total_tokens":120}';
    expect(redactAiText(text)).toBe(text);
  });
});
