"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductShell, EmptyState } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type ReplayRow = {
  id: string;
  sourceAuditId: string;
  athleteLabel: string;
  area: { id: string; name: string } | null;
  provider: string;
  model: string;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  totalTokens: number | null;
  createdAt: string;
  hasFeedback: boolean;
  chosenSide: string | null;
  overall: number | null;
};

export default function ReplaysPage() {
  const [items, setItems] = useState<ReplayRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    secureFetch(`${API_BASE}/ai-tuning/replays?page=${page}`).then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as {
          items: ReplayRow[];
          total: number;
        };
        setItems(data.items);
        setTotal(data.total);
      }
    });
  }, [page]);

  return (
    <ProductShell
      eyebrow="MONITORAGGIO AI"
      title="Storico test"
      description="Rivedi i test e le rigenerazioni gia eseguite sui prompt."
    >
      <div className="pf-stack" style={{ gap: 16 }}>
        <div className="pf-meta">{total} test totali</div>
        {items.length === 0 && (
          <EmptyState
            title="Nessun test"
            description="Apri un caso reale e lancia un test per iniziare."
          />
        )}
        {items.length > 0 && (
          <div className="pf-card">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Atleta</th>
                  <th>Area</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Token</th>
                  <th>Rubric</th>
                  <th>Data</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>{r.athleteLabel}</td>
                    <td>{r.area?.name ?? "—"}</td>
                    <td>
                      {r.provider} · {r.model}
                    </td>
                    <td>{r.status}</td>
                    <td>{r.totalTokens ?? "—"}</td>
                    <td>
                      {r.hasFeedback
                        ? `${r.chosenSide ?? ""} · ${r.overall ?? "—"}/5`
                        : "—"}
                    </td>
                    <td>{new Date(r.createdAt).toLocaleString("it-IT")}</td>
                    <td>
                      <Link
                        className="pf-button-secondary"
                        href={`/ai-tuner/replays/${r.id}`}
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
