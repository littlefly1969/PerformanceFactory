"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductShell, StatusBadge } from "@/app/components/product-shell";
import { adminRequest } from "../components/admin-request";

type Partner = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  isActive: boolean;
  attributedUsers: number;
};
type Funnel = {
  days: number;
  events: Record<string, number>;
  registrationsByPartner: { partner: string | null; registrations: number }[];
};

/** Ordine del funnel pre-login (A7); i conteggi sono persone distinte. */
const FUNNEL_STEPS = [
  ["landing_viewed", "Atterraggi"],
  ["discovery_started", "Discovery iniziate"],
  ["discovery_completed", "Discovery completate"],
  ["registration_started", "Registrazioni iniziate"],
  ["registration_completed", "Registrazioni completate"],
] as const;

const emptyDraft = { code: "", name: "", city: "" };

function clubLink(code: string, origin: string) {
  return `${origin}/start?club=${encodeURIComponent(code)}`;
}

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [funnel, setFunnel] = useState<Funnel>();
  const [days, setDays] = useState(30);
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const [nextPartners, nextFunnel] = await Promise.all([
        adminRequest<Partner[]>("/admin/partners"),
        adminRequest<Funnel>(`/admin/analytics/funnel?days=${days}`),
      ]);
      setPartners(nextPartners);
      setFunnel(nextFunnel);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [days]);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(done);
      await load();
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProductShell
      eyebrow="Amministrazione circoli"
      title="Circoli e provenienza"
      description="Ogni circolo ha un codice da usare nel link o nel QR. Chi si registra da quel link resta collegato al circolo; la prima provenienza vale sulle successive."
      actions={
        <button className="pf-button-secondary" type="button" onClick={load}>
          Aggiorna
        </button>
      }
      stats={[
        { label: "Circoli", value: partners.length, tone: "accent" },
        {
          label: "Attivi",
          value: partners.filter((partner) => partner.isActive).length,
          tone: "success",
        },
        {
          label: `Registrazioni ${days} gg`,
          value: funnel?.events.registration_completed ?? 0,
          tone: "warning",
        },
      ]}
    >
      {message && <div className="pf-alert warning">{message}</div>}
      <section className="pf-dashboard-grid">
        <article className="pf-panel">
          <div className="pf-panel-header">
            <h2>Circoli</h2>
          </div>
          <div className="pf-stack">
            {partners.map((partner) => (
              <article className="pf-card" key={partner.id}>
                <div className="pf-card-top">
                  <div>
                    <h3>{partner.name}</h3>
                    <p className="pf-muted">
                      {partner.city ?? "Città non indicata"} · {partner.code}
                    </p>
                  </div>
                  <StatusBadge tone={partner.isActive ? "success" : "neutral"}>
                    {partner.isActive ? "Attivo" : "Sospeso"}
                  </StatusBadge>
                </div>
                <p className="pf-muted">
                  Link per QR: {clubLink(partner.code, origin)}
                </p>
                <p className="pf-muted">
                  Atleti registrati: {partner.attributedUsers}
                </p>
                <button
                  className="pf-button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        adminRequest(`/admin/partners/${partner.id}`, "PATCH", {
                          isActive: !partner.isActive,
                        }),
                      partner.isActive ? "Circolo sospeso." : "Circolo attivato.",
                    )
                  }
                >
                  {partner.isActive ? "Sospendi" : "Attiva"}
                </button>
              </article>
            ))}
          </div>
          <form
            className="pf-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  adminRequest("/admin/partners", "POST", {
                    code: draft.code.trim().toLowerCase(),
                    name: draft.name.trim(),
                    ...(draft.city.trim() ? { city: draft.city.trim() } : {}),
                  }),
                "Circolo creato.",
              ).then((created) => created && setDraft(emptyDraft));
            }}
          >
            <h3>Nuovo circolo</h3>
            {(
              [
                ["name", "Nome", true],
                ["city", "Città o zona", false],
                ["code", "Codice (es. padel-roma-nord)", true],
              ] as const
            ).map(([field, label, required]) => (
              <label className="pf-field" key={field}>
                {label}
                <input
                  className="pf-input"
                  required={required}
                  value={draft[field]}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <button className="pf-button" type="submit" disabled={busy}>
              Crea circolo
            </button>
          </form>
        </article>
        <article className="pf-panel">
          <div className="pf-panel-header">
            <h2>Funnel prima del login</h2>
            <select
              className="pf-input"
              aria-label="Periodo"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {[7, 30, 90].map((value) => (
                <option key={value} value={value}>
                  Ultimi {value} giorni
                </option>
              ))}
            </select>
          </div>
          <dl className="pf-stack">
            {FUNNEL_STEPS.map(([key, label]) => (
              <div className="pf-card-top" key={key}>
                <dt>{label}</dt>
                <dd>{funnel?.events[key] ?? 0}</dd>
              </div>
            ))}
          </dl>
          <h3>Registrazioni per circolo</h3>
          <dl className="pf-stack">
            {funnel?.registrationsByPartner.map((row) => (
              <div className="pf-card-top" key={row.partner ?? "direct"}>
                <dt>{row.partner ?? "Nessun circolo"}</dt>
                <dd>{row.registrations}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>
    </ProductShell>
  );
}
