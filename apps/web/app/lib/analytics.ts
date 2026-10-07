import { API_BASE } from "./api";
import { anonymousId, newId } from "./attribution";

/** Eventi del funnel prima del login (event map A7). */
export type ClientEvent =
  | "landing_viewed"
  | "discovery_started"
  | "discovery_completed"
  | "registration_started";

type Properties = Record<string, string | number | boolean>;

/**
 * Invia un evento senza bloccare l'interfaccia: un errore di rete o uno
 * storage non disponibile non devono mai fermare il percorso.
 */
export function track(name: ClientEvent, properties?: Properties) {
  const id = anonymousId();
  if (!id) return;
  try {
    void fetch(`${API_BASE}/public/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        anonymousId: id,
        events: [
          {
            name,
            // Un reinvio dello stesso evento non viene contato due volte.
            eventId: newId(),
            occurredAt: new Date().toISOString(),
            ...(properties ? { properties } : {}),
          },
        ],
      }),
    }).catch(() => undefined);
  } catch {
    /* Tracciamento facoltativo. */
  }
}
