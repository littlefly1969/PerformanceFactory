"use client";
import { useState } from "react";
import { useResource } from "../../journey/_account/account-data";
import { API_BASE, secureFetch } from "../../lib/api";

/** Documento versionato del consenso, come lo restituisce l'API. */
type ConsentDocument = {
  type: string;
  version: string;
  title: string;
  summary: string;
  body: string[];
};
type Visibility = { granted: boolean; document: ConsentDocument };

const VISIBILITY_PATH = "/athlete/ranking/visibility";

/**
 * Consenso facoltativo a comparire nel ranking con nome e iniziale del
 * cognome. Senza, gli altri vedono «Atleta» accanto ai tuoi numeri. Il
 * testo completo, con la sua versione, si legge prima di dare il consenso:
 * la casella si attiva solo quando il documento è arrivato.
 */
export function RankingVisibility({
  granted,
  onChange,
  tone = "light",
}: {
  granted: boolean;
  onChange?: (granted: boolean) => void;
  tone?: "light" | "dark";
}) {
  const resource = useResource<Visibility>(VISIBILITY_PATH);
  const doc = resource.data?.document ?? null;
  // Dopo un salvataggio vale la risposta del PUT, prima lo stato letto.
  const [saved, setSaved] = useState<boolean | null>(null);
  const value = saved ?? resource.data?.granted ?? granted;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function change(next: boolean) {
    if (busy || !doc) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await secureFetch(`${API_BASE}${VISIBILITY_PATH}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ granted: next }),
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { granted: boolean };
      setSaved(result.granted);
      onChange?.(result.granted);
      setMessage(
        result.granted
          ? "Gli altri vedono il tuo nome e l’iniziale."
          : "Nel ranking compari come «Atleta».",
      );
    } catch {
      setMessage("Non è stato possibile salvare. Riprova.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`pf-rank-visibility is-${tone}`}>
      <label>
        <input
          type="checkbox"
          checked={value}
          disabled={busy || !doc}
          aria-describedby="pf-rank-consent-summary"
          onChange={(e) => void change(e.target.checked)}
        />
        <span>
          Compaio nel ranking con nome e iniziale
          <small id="pf-rank-consent-summary">
            {doc?.summary ??
              "Facoltativo. Senza, gli altri vedono «Atleta» accanto ai tuoi numeri."}
          </small>
        </span>
      </label>
      {doc && (
        <details className="pf-rank-consent">
          <summary>Leggi il testo completo</summary>
          <section aria-label={doc.title}>
            <b>{doc.title}</b>
            {doc.body.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
            <small>Versione {doc.version}</small>
          </section>
        </details>
      )}
      {resource.error && !doc && (
        <p role="alert">
          Il testo del consenso non è disponibile: riprova più tardi.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
