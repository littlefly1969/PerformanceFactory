"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { DataTable } from "@/app/components/workspace/data-table";
import { useAdminReport } from "../components/use-admin-report";

type Day = { day: string; started: number; pending: number; completed: number };
type Report = {
  days: number;
  timezone: string;
  generatedAt: string;
  daily: Day[];
  totals: Omit<Day, "day">;
};
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Rome",
  });

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const { data, error, loading, refresh } = useAdminReport<Report>(
    `/admin/analytics/registrations?days=${days}`,
    60000,
  );
  const series = data?.daily.slice(0, 14).toReversed() ?? [];
  const max = Math.max(1, ...series.flatMap((d) => [d.started, d.completed]));
  return (
    <ProductShell
      eyebrow="Amministrazione"
      title="Dashboard registrazioni"
      description="Dall’apertura del modulo alla creazione dell’account. Giorni e orari nel fuso di Roma."
      actions={
        <Link className="ws-control" href="/admin/ai-logs">
          Controlla chiamate AI →
        </Link>
      }
      stats={[
        { label: "Avviate nel periodo", value: data?.totals.started ?? "—" },
        {
          label: "Avviate e non completate",
          value: data?.totals.pending ?? "—",
          tone: "accent",
        },
        {
          label: "Account creati nel periodo",
          value: data?.totals.completed ?? "—",
        },
        {
          label: "Account creati oggi",
          value: data?.daily[0]?.completed ?? "—",
        },
      ]}
    >
      <div className="ws-table-tools">
        <label className="ws-filter-date">
          Periodo{" "}
          <select
            aria-label="Periodo"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((n) => (
              <option key={n} value={n}>
                Ultimi {n} giorni
              </option>
            ))}
          </select>
        </label>
        <button className="ws-control" onClick={refresh} disabled={loading}>
          {loading ? "Aggiornamento…" : "Aggiorna"}
        </button>
        <span className="pf-muted" role="status">
          {data
            ? `Aggiornato alle ${new Date(data.generatedAt).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" })} · automatico ogni minuto`
            : "Caricamento dati…"}
        </span>
      </div>
      {error && (
        <p role="alert" className="pf-alert warning">
          {error}{" "}
          {data &&
            "I dati mostrati risalgono all’ultimo aggiornamento riuscito."}
        </p>
      )}
      <section
        className="pf-panel report-definitions"
        aria-label="Come leggere i conteggi"
      >
        <strong>Come leggere i conteggi</strong>
        <p>
          Avviate: browser distinti che hanno aperto il modulo, contati una
          volta nel periodo e assegnati al primo giorno di apertura. Non
          completate: tra questi, quelli senza una registrazione collegata al
          momento dell’aggiornamento.
        </p>
        <p>
          Account creati: registrazioni confermate dal server, nel giorno di
          completamento. Possono provenire da moduli aperti prima del periodo.
          Browser diversi, blocchi del tracciamento e dati cancellati limitano
          il collegamento: questi numeri non indicano chi è online adesso.
        </p>
      </section>
      {data && (
        <section className="pf-panel" aria-label="Andamento registrazioni">
          <div className="report-heading">
            <h2>Andamento giornaliero</h2>
            <span className="pf-muted">
              {days > 14
                ? "Ultimi 14 giorni del periodo"
                : "Periodo selezionato"}
            </span>
          </div>
          <p className="report-legend">
            <span>● Avviate</span>
            <span>● Account creati</span>
          </p>
          <div className="report-chart">
            {series.map((d) => (
              <div
                className="report-chart-day"
                key={d.day}
                title={`${dayLabel(d.day)}: ${d.started} avviate, ${d.completed} account creati`}
              >
                <div className="report-bars" aria-hidden="true">
                  <span style={{ height: `${(d.started / max) * 100}%` }} />
                  <span style={{ height: `${(d.completed / max) * 100}%` }} />
                </div>
                <small>
                  {d.day.slice(8)}/{d.day.slice(5, 7)}
                </small>
                <span className="ws-sr-only">
                  {dayLabel(d.day)}: {d.started} avviate, {d.completed} account
                  creati
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="pf-panel">
        <h2>Dettaglio per giorno</h2>
        <DataTable<Day>
          rows={data?.daily ?? []}
          rowKey={(d) => d.day}
          label="Registrazioni per giorno"
          loading={loading && !data}
          searchText={(d) => dayLabel(d.day)}
          initialSort={{ id: "day", direction: "desc" }}
          columns={[
            {
              id: "day",
              label: "Giorno",
              value: (d) => d.day,
              render: (d) => dayLabel(d.day),
            },
            {
              id: "started",
              label: "Avviate",
              value: (d) => d.started,
              render: (d) => d.started,
            },
            {
              id: "pending",
              label: "Non completate adesso",
              value: (d) => d.pending,
              render: (d) => d.pending,
            },
            {
              id: "completed",
              label: "Account creati",
              value: (d) => d.completed,
              render: (d) => <strong>{d.completed}</strong>,
            },
          ]}
        />
      </section>
    </ProductShell>
  );
}
