"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductShell, StatusBadge } from "@/app/components/product-shell";
import { adminRequest } from "../components/admin-request";

type Flag = {
  key: string;
  description: string;
  enabled: boolean;
  betaTesters: boolean;
  rolloutPercent: number;
  updatedAt: string | null;
};
type Tester = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

function audience(flag: Flag) {
  if (!flag.enabled) return "Spento";
  if (flag.rolloutPercent >= 100) return "Tutti";
  const parts = [];
  if (flag.betaTesters) parts.push("beta tester");
  if (flag.rolloutPercent > 0) parts.push(`${flag.rolloutPercent}% utenti`);
  return parts.length ? parts.join(" + ") : "Nessuno";
}

export default function AdminFeatureFlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [testers, setTesters] = useState<Tester[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const [nextFlags, nextTesters] = await Promise.all([
        adminRequest<Flag[]>("/admin/feature-flags"),
        adminRequest<Tester[]>("/admin/beta-testers"),
      ]);
      setFlags(nextFlags);
      setTesters(nextTesters);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(done);
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const update = (flag: Flag, change: Partial<Flag>) =>
    run(
      () => adminRequest(`/admin/feature-flags/${flag.key}`, "PATCH", change),
      `Flag ${flag.key} aggiornato.`,
    );

  const setTester = (address: string, isBetaTester: boolean) =>
    run(
      () =>
        adminRequest("/admin/beta-testers", "PUT", {
          email: address,
          isBetaTester,
        }),
      isBetaTester ? "Beta tester aggiunto." : "Beta tester rimosso.",
    );

  return (
    <ProductShell
      eyebrow="Amministrazione rilasci"
      title="Feature flag e beta tester"
      description="Rilascia le funzioni per gradi: prima ai beta tester, poi a una percentuale stabile di utenti, infine a tutti. Ogni modifica resta nello storico."
      actions={
        <button className="pf-button-secondary" type="button" onClick={load}>
          Aggiorna
        </button>
      }
      stats={[
        { label: "Flag", value: flags.length, tone: "accent" },
        {
          label: "Accesi",
          value: flags.filter((flag) => flag.enabled).length,
          tone: "success",
        },
        { label: "Beta tester", value: testers.length, tone: "warning" },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}
      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <h2>Flag</h2>
          </div>
          <div className="pf-stack">
            {flags.map((flag) => (
              <article className="pf-card" key={flag.key}>
                <div className="pf-card-top">
                  <div>
                    <h3>{flag.key}</h3>
                    <p className="pf-muted">{flag.description}</p>
                  </div>
                  <StatusBadge tone={flag.enabled ? "success" : "neutral"}>
                    {audience(flag)}
                  </StatusBadge>
                </div>
                <label className="pf-checkbox">
                  <input
                    type="checkbox"
                    checked={flag.enabled}
                    disabled={busy}
                    onChange={(event) =>
                      void update(flag, { enabled: event.target.checked })
                    }
                  />
                  Acceso
                </label>
                <label className="pf-checkbox">
                  <input
                    type="checkbox"
                    checked={flag.betaTesters}
                    disabled={busy}
                    onChange={(event) =>
                      void update(flag, { betaTesters: event.target.checked })
                    }
                  />
                  Sempre attivo per i beta tester
                </label>
                <label className="pf-field">
                  Percentuale di utenti
                  <select
                    className="pf-input"
                    value={flag.rolloutPercent}
                    disabled={busy}
                    onChange={(event) =>
                      void update(flag, {
                        rolloutPercent: Number(event.target.value),
                      })
                    }
                  >
                    {[0, 5, 10, 25, 50, 100].map((percent) => (
                      <option key={percent} value={percent}>
                        {percent}%
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </div>
        </article>
        <article className="pf-panel">
          <div className="pf-panel-header">
            <h2>Beta tester</h2>
          </div>
          <form
            className="pf-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void setTester(email, true).then(() => setEmail(""));
            }}
          >
            <label className="pf-field">
              E-mail utente registrato
              <input
                className="pf-input"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button className="pf-button" type="submit" disabled={busy}>
              Aggiungi
            </button>
          </form>
          <ul className="pf-stack">
            {testers.map((tester) => (
              <li className="pf-card-top" key={tester.id}>
                <span>
                  {tester.email}
                  {tester.firstName ? ` · ${tester.firstName}` : ""}
                </span>
                <button
                  className="pf-button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void setTester(tester.email, false)}
                >
                  Rimuovi
                </button>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </ProductShell>
  );
}
