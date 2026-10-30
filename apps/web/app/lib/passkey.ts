import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';
import { API_BASE, secureFetch } from './api';

/** Una passkey come la mostra l'elenco in Account. */
export type PasskeySummary = {
  id: string;
  name: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PasskeyLoginResult = {
  email?: string;
  role?: string;
  accessToken?: string;
};

/** L'utente ha chiuso il Face ID o l'impronta: non è un errore da mostrare. */
export class PasskeyCancelled extends Error {}

export const supportsPasskeys = () =>
  typeof window !== 'undefined' && browserSupportsWebAuthn();

export const supportsPasskeyAutofill = async () =>
  supportsPasskeys() && (await browserSupportsWebAuthnAutofill());

/**
 * Il server tiene un solo challenge per sessione e la libreria una sola
 * richiesta WebAuthn: vale sempre l'ultimo tentativo. Le richieste di opzioni
 * vanno una alla volta, e un tentativo superato non apre più Face ID.
 */
let latestAttempt = 0;
let optionsInFlight: Promise<unknown> = Promise.resolve();

/** Interrompe una richiesta passkey ancora aperta, ad esempio l'autofill. */
export const cancelPasskeyRequest = () => {
  latestAttempt += 1;
  WebAuthnAbortService.cancelCeremony();
};

async function loginOptions() {
  const previous = optionsInFlight;
  let release = () => {};
  optionsInFlight = new Promise<void>((resolve) => (release = resolve));
  await previous.catch(() => undefined);
  try {
    return await postJson('/auth/passkeys/login/options');
  } finally {
    release();
  }
}

async function errorMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { message?: string };
    return typeof data.message === 'string' ? data.message : fallback;
  } catch {
    return fallback;
  }
}

function isCancel(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
}

async function postJson(path: string, body?: unknown) {
  // Il login non ha ancora un token: basta il cookie di sessione.
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    // Fastify rifiuta un corpo vuoto dichiarato come JSON.
    body: JSON.stringify(body ?? {}),
  });
}

/**
 * Accesso con passkey. Con `autofill` il telefono propone la passkey dal campo
 * e-mail; senza, apre subito Face ID o impronta (serve un tocco dell'utente).
 */
export async function loginWithPasskey(
  autofill = false,
): Promise<PasskeyLoginResult> {
  const attempt = ++latestAttempt;
  const optionsResponse = await loginOptions();
  if (!optionsResponse.ok) {
    throw new Error(
      await errorMessage(
        optionsResponse,
        'Accesso con passkey non disponibile.',
      ),
    );
  }
  const optionsJSON = await optionsResponse.json();
  // Un click arrivato nel frattempo ha la precedenza: niente startAuthentication
  // che annullerebbe il suo Face ID.
  if (attempt !== latestAttempt) throw new PasskeyCancelled();
  let response;
  try {
    response = await startAuthentication({
      optionsJSON,
      useBrowserAutofill: autofill,
    });
  } catch (error) {
    if (isCancel(error)) throw new PasskeyCancelled();
    throw new Error('Accesso con passkey non riuscito.');
  }
  const verify = await postJson('/auth/passkeys/login/verify', { response });
  if (!verify.ok) {
    throw new Error(
      await errorMessage(verify, 'Accesso con passkey non riuscito.'),
    );
  }
  return (await verify.json()) as PasskeyLoginResult;
}

/** Crea una passkey per l'utente già entrato e la salva sul server. */
export async function registerPasskey(): Promise<PasskeySummary> {
  const optionsResponse = await secureFetch(
    `${API_BASE}/auth/passkeys/register/options`,
    { method: 'POST' },
  );
  if (!optionsResponse.ok) {
    throw new Error(
      await errorMessage(
        optionsResponse,
        'Non riusciamo ad attivare la passkey.',
      ),
    );
  }
  let response;
  try {
    response = await startRegistration({
      optionsJSON: await optionsResponse.json(),
    });
  } catch (error) {
    if (isCancel(error)) throw new PasskeyCancelled();
    if (error instanceof Error && error.name === 'InvalidStateError') {
      throw new Error('Questo dispositivo ha già una passkey attiva.');
    }
    throw new Error('Non riusciamo ad attivare la passkey.');
  }
  const verify = await secureFetch(
    `${API_BASE}/auth/passkeys/register/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    },
  );
  if (!verify.ok) {
    throw new Error(
      await errorMessage(verify, 'Non riusciamo ad attivare la passkey.'),
    );
  }
  return (await verify.json()) as PasskeySummary;
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
  const response = await secureFetch(`${API_BASE}/auth/passkeys`);
  if (!response.ok) throw new Error('Non riusciamo a leggere le passkey.');
  return (await response.json()) as PasskeySummary[];
}

export async function deletePasskey(id: string) {
  const response = await secureFetch(
    `${API_BASE}/auth/passkeys/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw new Error('Non riusciamo a eliminare la passkey.');
}
