"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
type TestResult = {
  provider: string;
  model: string;
  latencyMs: number;
  totalTokens?: number | null;
};
type TestRunHistoryItem = {
  id: string;
  goldenId: string;
  createdAt: string;
  snapshot: {
    promptName: string;
    version: string;
  };
  result: TestResult;
};

const testHistoryStorageKey = "pf-ai-tuner-standard-test-history-v1";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export default function GoldenContextsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Golden[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [editing, setEditing] = useState<Golden | null>(null);
  const [creating, setCreating] = useState(false);
  const [testHistory, setTestHistory] = useState<TestRunHistoryItem[]>([]);
  const createParamHandled = useRef(false);
  const editParamHandled = useRef<string | null>(null);
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(testHistoryStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as TestRunHistoryItem[];
      if (Array.isArray(parsed)) {
        setTestHistory(parsed);
      }
    } catch {
      setTestHistory([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (
      editId &&
      editParamHandled.current !== editId &&
      !creating &&
      !editing &&
      items.length > 0
    ) {
      const target = items.find((item) => item.id === editId);
      if (!target) return;
      editParamHandled.current = editId;
      setCreating(false);
      setEditing(target);
      setForm({
        label: target.label,
        description: target.description ?? "",
        areaId: target.areaId,
        athleteLevel: target.athleteLevel ?? "",
        contextJsonText: JSON.stringify(target.contextJson, null, 2),
      });
    }
  }, [creating, editing, items]);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("create") === "1" &&
      !new URLSearchParams(window.location.search).get("edit") &&
      !createParamHandled.current &&
      !creating &&
      !editing
    ) {
      createParamHandled.current = true;
      setEditing(null);
      setCreating(true);
      setForm({
        label: "",
        description: "",
        areaId: areas[0]?.id ?? "",
        athleteLevel: "",
        contextJsonText: "{}",
      });
    }
  }, [areas, creating, editing]);

  const clearRouteParams = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo");
    if (returnTo) {
      router.replace(returnTo, { scroll: false });
      return;
    }
    if (params.get("create") === "1" || params.get("edit")) {
      router.replace("/ai-tuner/golden-contexts", { scroll: false });
    }
  }, [router]);

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

  const parseSyntheticContext = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed);
    } catch {
      return { note: trimmed };
    }
  };

  const save = async () => {
    const context = parseSyntheticContext(form.contextJsonText);
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
      const wasCreating = !editing;
      setEditing(null);
      setCreating(false);
      if (wasCreating || editing) clearRouteParams();
      void load();
    } else {
      alert("Errore salvataggio");
    }
  };

  const removeGolden = async (id: string) => {
    if (!confirm("Eliminare questo caso test standard?")) return;
    const res = await secureFetch(
      `${API_BASE}/ai-tuning/golden-contexts/${id}`,
      { method: "DELETE" },
    );
    if (res.ok) void load();
  };

  const editingHistory = editing
    ? testHistory
        .filter((item) => item.goldenId === editing.id)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
    : [];

  const openHistoryResult = (item: TestRunHistoryItem) => {
    router.push(
      `/ai-tuner/test-cases?mode=standard&caseId=${item.goldenId}&historyId=${item.id}`,
    );
  };

  const removeHistoryItem = (id: string) => {
    if (!window.confirm("Rimuovere questo test dallo storico?")) return;
    setTestHistory((current) => {
      const next = current.filter((item) => item.id !== id);
      window.localStorage.setItem(testHistoryStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const renderEditingHistory = () => (
    <section className="pf-panel pf-test-history-panel">
      <div className="pf-panel-header">
        <div>
          <h2>Storico test eseguiti</h2>
          <p className="pf-muted">
            Test gia eseguiti su questo caso test standard. Clicca una riga per
            riaprire il risultato.
          </p>
        </div>
      </div>

      {editingHistory.length === 0 ? (
        <div className="pf-alert warning">
          Non ci sono ancora test eseguiti su questo caso test standard.
        </div>
      ) : (
        <div className="pf-card pf-test-history-table-wrap">
          <table className="pf-table pf-test-history-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Prompt</th>
                <th>Versione</th>
                <th>Provider / modello</th>
                <th>Tempo</th>
                <th>Token</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {editingHistory.map((item) => (
                <tr
                  key={item.id}
                  className="pf-clickable-table-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => openHistoryResult(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openHistoryResult(item);
                    }
                  }}
                >
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{item.snapshot.promptName}</td>
                  <td>{item.snapshot.version}</td>
                  <td>
                    {item.result.provider} / {item.result.model}
                  </td>
                  <td>{item.result.latencyMs} ms</td>
                  <td>{item.result.totalTokens ?? "n/d"}</td>
                  <td>
                    <button
                      type="button"
                      className="pf-button-secondary pf-history-remove-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeHistoryItem(item.id);
                      }}
                    >
                      Rimuovi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const pageTitle = editing
    ? "Modifica caso test"
    : creating
      ? "Nuovo caso test"
      : "Casi test standard";
  const pageDescription = editing
    ? "Aggiorna impostazioni e dati sintetici del caso test selezionato."
    : creating
      ? "Crea un nuovo caso test standard riutilizzabile."
      : "Profili atleta riutilizzabili per provare i prompt sempre sugli stessi scenari.";

  return (
    <ProductShell
      eyebrow="TEST SU CASI"
      title={pageTitle}
      description={pageDescription}
      actions={!creating && !editing ? (
        <button
          type="button"
          className="pf-button"
          onClick={startCreate}
        >
          Nuovo caso test
        </button>
      ) : undefined}
    >
      <div className="pf-stack" style={{ gap: 16 }}>
        {items.length === 0 && !creating && !editing && (
          <EmptyState
            title="Nessun caso test standard"
            description="Creane uno da zero, o salvalo a partire da una generazione reale."
          />
        )}

        {(creating || editing) && (
          <section className="pf-card">
            <h3>{editing ? "Modifica caso test" : "Nuovo caso test"}</h3>
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
              Dati sintetici del caso
              <span className="pf-field-hint">
                Puoi scrivere testo libero oppure JSON strutturato.
              </span>
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
            <div className="pf-form-actions">
              <button type="button" className="pf-button" onClick={save}>
                Salva
              </button>
              <button
                type="button"
                className="pf-button-secondary"
                onClick={() => {
                  setEditing(null);
                  setCreating(false);
                  clearRouteParams();
                }}
              >
                Annulla
              </button>
            </div>
          </section>
        )}

        {editing && renderEditingHistory()}

        {items.length > 0 && !creating && !editing && (
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
