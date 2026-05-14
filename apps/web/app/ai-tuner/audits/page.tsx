"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProductShell, EmptyState } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Area = { id: string; name: string };
type AuditRow = {
  id: string;
  athleteLabel: string;
  createdAt: string;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  area: Area | null;
  cycleVersion: number | null;
};

export default function AuditsListPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState<string>("");
  const [items, setItems] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (areaId) params.set("areaId", areaId);
    params.set("page", String(page));
    const res = await secureFetch(`${API_BASE}/ai-tuning/audits?${params}`);
    if (res.ok) {
      const data = (await res.json()) as {
        items: AuditRow[];
        total: number;
      };
      setItems(data.items);
      setTotal(data.total);
    }
    setLoading(false);
  }, [areaId, page]);

  useEffect(() => {
    secureFetch(`${API_BASE}/ai-tuning/areas`).then(async (res) => {
      if (res.ok) setAreas((await res.json()) as Area[]);
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ProductShell
      eyebrow="AI TUNING"
      title="Audit AI per replay"
      description="Sfoglia le generazioni reali. Il riferimento all'atleta è pseudonimizzato."
    >
      <div className="pf-stack" style={{ gap: 16 }}>
        <div className="pf-row" style={{ gap: 12, alignItems: "flex-end" }}>
          <label className="pf-field">
            Area
            <select
              className="pf-input"
              value={areaId}
              onChange={(e) => {
                setPage(1);
                setAreaId(e.target.value);
              }}
            >
              <option value="">Tutte</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>
          <div className="pf-meta">
            {total} audit totali · pagina {page}
          </div>
        </div>

        {loading && <p>Caricamento…</p>}
        {!loading && items.length === 0 && (
          <EmptyState
            title="Nessun audit"
            description="Non ci sono audit per i filtri scelti."
          />
        )}

        {items.length > 0 && (
          <div className="pf-card">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Atleta</th>
                  <th>Area</th>
                  <th>Provider · Modello</th>
                  <th>Token</th>
                  <th>Data</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.athleteLabel}</td>
                    <td>{row.area?.name ?? "—"}</td>
                    <td>
                      {row.provider} · {row.model}
                    </td>
                    <td>
                      {row.totalTokens != null
                        ? `${row.totalTokens} (in ${row.inputTokens ?? "?"} / out ${row.outputTokens ?? "?"})`
                        : "—"}
                    </td>
                    <td>{new Date(row.createdAt).toLocaleString("it-IT")}</td>
                    <td>
                      <Link
                        className="pf-button-secondary"
                        href={`/ai-tuner/audits/${row.id}`}
                      >
                        Apri
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pf-row" style={{ justifyContent: "space-between" }}>
          <button
            type="button"
            className="pf-button-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Precedente
          </button>
          <button
            type="button"
            className="pf-button-secondary"
            disabled={items.length < 30}
            onClick={() => setPage((p) => p + 1)}
          >
            Successivo
          </button>
        </div>
      </div>
    </ProductShell>
  );
}
