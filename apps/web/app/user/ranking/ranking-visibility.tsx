"use client";
import { useState } from "react";
import { API_BASE, secureFetch } from "../../lib/api";

/**
 * Consenso facoltativo a comparire nel ranking con nome e iniziale del
 * cognome. Senza, gli altri vedono «Atleta» accanto ai tuoi numeri.
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
  const [value, setValue] = useState(granted);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function change(next: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await secureFetch(
        `${API_BASE}/athlete/ranking/visibility`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ granted: next }),
        },
      );
      if (!response.ok) throw new Error();
      const saved = (await response.json()) as { granted: boolean };
      setValue(saved.granted);
      onChange?.(saved.granted);
      setMessage(
        saved.granted
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
          disabled={busy}
          onChange={(e) => void change(e.target.checked)}
        />
        <span>
          Compaio nel ranking con nome e iniziale
          <small>
            Facoltativo. Senza, gli altri vedono «Atleta» accanto ai tuoi
            numeri.
          </small>
        </span>
      </label>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
