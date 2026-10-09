import { API_BASE } from "../lib/api";
import type { DiscoveryConfiguration, DiscoveryDraft } from "./discovery-types";

/**
 * Bozza del quiz salvata sul server (PF-FS-PREPAYWALL F1): il token resta su
 * questo dispositivo e serve solo a riprendere il proprio quiz entro 7 giorni
 * dall'ultima risposta. Non identifica la persona e non entra negli eventi.
 * Se il browser non permette di salvarlo, il quiz prosegue con la copia di
 * sessione.
 */
export const QUIZ_TOKEN_KEY = "pf.quizToken";
const URL = `${API_BASE}/public`;

export function readQuizToken() {
  try {
    return window.localStorage.getItem(QUIZ_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearQuizToken() {
  try {
    window.localStorage.removeItem(QUIZ_TOKEN_KEY);
  } catch {
    /* Niente da azzerare. */
  }
}

function writeQuizToken(token: string) {
  try {
    window.localStorage.setItem(QUIZ_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

type SavedQuiz = {
  configuration: DiscoveryConfiguration;
  draft: DiscoveryDraft;
};

/** Riprende la bozza; null se manca, è scaduta o il server non risponde. */
export async function resumeQuiz(): Promise<SavedQuiz | null> {
  const token = readQuizToken();
  if (!token) return null;
  try {
    const response = await fetch(`${URL}/quiz-draft`, {
      headers: { "x-quiz-token": token },
      cache: "no-store",
    });
    if (response.status === 404) clearQuizToken();
    return response.ok ? ((await response.json()) as SavedQuiz) : null;
  } catch {
    return null;
  }
}

/** Avvia la bozza con la versione corrente del quiz, congelata sul server. */
export async function startQuiz(): Promise<SavedQuiz | null> {
  try {
    const response = await fetch(`${URL}/quiz-drafts`, { method: "POST" });
    if (!response.ok) return null;
    const created = (await response.json()) as SavedQuiz & { token?: unknown };
    return typeof created.token === "string" && writeQuizToken(created.token)
      ? created
      : null;
  } catch {
    return null;
  }
}

/** Salva il progresso; una bozza scaduta lascia proseguire con la copia locale. */
export async function saveQuiz(draft: DiscoveryDraft) {
  const token = readQuizToken();
  if (!token) return;
  try {
    const response = await fetch(`${URL}/quiz-draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-quiz-token": token },
      body: JSON.stringify({ draft }),
    });
    if (response.status === 404) clearQuizToken();
  } catch {
    /* La copia di sessione conserva il progresso. */
  }
}

/** Ingresso da campagna, QR del circolo o referral (A6-D01, AT-01). */
export function campaignEntry(url: URL) {
  return ["utm_source", "utm_campaign", "club", "ref"].some((key) =>
    url.searchParams.get(key),
  );
}

/**
 * Invia la registrazione con il token della bozza, così il server collega le
 * risposte alla versione congelata del quiz. Se la bozza è scaduta nel
 * frattempo, riprova una volta con la sola copia locale.
 */
export async function withQuizToken(
  send: (quizToken?: string) => Promise<Response>,
) {
  const token = readQuizToken() ?? undefined;
  const response = await send(token);
  if (response.status !== 404 || !token) return response;
  clearQuizToken();
  return send();
}
