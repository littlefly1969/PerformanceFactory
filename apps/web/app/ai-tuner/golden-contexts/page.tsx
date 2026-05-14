"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductShell, EmptyState } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type Area = { id: string; name: string };
type Golden = {
  id: string;
  label: string;
  description: string | null;
  athleteLevel: string | null;
  areaId: string;
  area: Area;
  contextJson: unknown;
  isActive: boolean;
  createdAt: string;
};

export default function GoldenContextsPage() {
  const [items, setItems] = useState<Golden[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [editing, setEditing] = useState<Golden | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    label: "",
    description: "",
    areaId: "",
    athleteLevel: "",
    contextJsonText: "{}",
  });

  const load = useCallback(async () => {
    const [resG, resA] = await Promise.all([
      secureFetch(`${API_BASE}/ai-tuning/golden-contexts`),
      secureFetch(`${API_BASE}/ai-tuning/areas`),
    ]);
    if (resG.ok) setItems((await resG.json()) as Golden[]);
    if (resA.ok) setAreas((await resA.json()) as Area[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm({
      label: "",
      description: "",
      areaId: areas[0]?.id ?? "",
      athleteLevel: "",
      contextJsonText: "{}",
    });
  };

  const startEdit = (g: Golden) => {
    setCreating(false);
    setEditing(g);
    setForm({
      label: g.label,
      description: g.description ?? "",
      areaId: g.areaId,
      athleteLevel: g.athleteLevel ?? "",
      contextJsonText: JSON.stringify(g.contextJson, null, 2),
    });
  };

  const save = async () => {
    let context: unknown;
    try {
      context = JSON.parse(form.contextJsonText);
    } catch {
      alert("JSON contesto non valido");
      return;
    }
    const body = {
      label: form.label,
      description: form.description || undefined,
      areaId: form.areaId,
      athleteLevel: form.athleteLevel || undefined,
      contextJson: context,
    };
    const url = editing
      ? `${API_BASE}/ai-tuning/golden-contexts/${editing.id}`
      : `${API_BASE}/ai-tuning/golden-contexts`;
    const method = editing ? "PATCH" : "POST";
    const res = await secureFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setEditing(null);
      setCreating(false);
      void load();
    } else {
      alert("Errore salvataggio");
    }
  };

  const removeGolden = async (id: string) => {
    if (!confirm("Eliminare questo golden context?")) return;
    const res = await secureFetch(
      `${API_BASE}/ai-tuning/golden-contexts/${id}`,
      { method: "DELETE" },
    );
    if (res.ok) void load();
  };

  return (
    <ProductShell
      eyebrow="AI TUNING"
      title="Golden context"
      description="Atleti-tipo riutilizzabili per le valutazioni sistematiche."
      actions={
        <button
          type="button"
          className="pf-button"
          onClick={startCreate}
        >
          Nuovo golden
        </button>
      }
    >
      <div className="pf-stack" style={{ gap: 16 }}>
        {items.length === 0 && !creating && !editing && (
          <EmptyState
            title="Nessun golden context"
            description="Creane uno da zero, o salvalo a partire da un audit reale."
          />
        )}

        {(creating || editing) && (
          <section className="pf-card">
            <h3>{editing ? "Modifica golden" : "Nuovo golden"}</h3>
            <label className="pf-field">
              Etichetta
              <input
                className="pf-input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </label>
            <label className="pf-field">
              Descrizione
              <input
                className="pf-input"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <div className="pf-row" style={{ gap: 12 }}>
              <label className="pf-field" style={{ flex: 1 }}>
                Area
                <select
                  className="pf-input"
                  value={form.areaId}
                  onChange={(e) => setForm({ ...form, areaId: e.target.value })}
                >
                  <option value="">Seleziona</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-field" style={{ flex: 1 }}>
                Livello atleta
                <select
                  className="pf-input"
                  value={form.athleteLevel}
                  onChange={(e) =>
                    setForm({ ...form, athleteLevel: e.target.value })
                  }
                >
                  <option value="">—</option>
                  <option value="BASELINE">BASELINE</option>
                  <option value="STABLE">STABLE</option>
                  <option value="ADVANCED">ADVANCED</option>
                </select>
              </label>
            </div>
            <label className="pf-field">
              Contesto JSON (AiCycleContext)
              <textarea
                className="pf-input"
                rows={14}
                value={form.contextJsonText}
                onChange={(e) =>
                  setForm({ ...form, contextJsonText: e.target.value })
                }
                style={{ fontFamily: "monospace", fontSize: 12 }}
              />
            </label>
            <div className="pf-row" style={{ gap: 12 }}>
              <button type="button" className="pf-button" onClick={save}>
                Salva
              </button>
              <button
                type="button"
                className="pf-button-secondary"
                onClick={() => {
                  setEditing(null);
                  setCreating(false);
                }}
              >
                Annulla
              </button>
            </div>
          </section>
        )}

        {items.length > 0 && (
          <div className="pf-card">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Etichetta</th>
                  <th>Area</th>
                  <th>Livello</th>
                  <th>Descrizione</th>
                  <th>Attivo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((g) => (
                  <tr key={g.id}>
                    <td>{g.label}</td>
                    <td>{g.area.name}</td>
                    <td>{g.athleteLevel ?? "—"}</td>
                    <td>{g.description ?? "—"}</td>
                    <td>{g.isActive ? "✓" : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="pf-button-secondary"
                        onClick={() => startEdit(g)}
                      >
                        Modifica
                      </button>{" "}
                      <button
                        type="button"
                        className="pf-button-secondary"
                        onClick={() => removeGolden(g.id)}
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ProductShell>
  );
}
