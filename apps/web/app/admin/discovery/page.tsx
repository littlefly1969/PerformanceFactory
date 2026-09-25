"use client";
import { useEffect, useState } from "react";
import { ProductShell } from "../../components/product-shell";
import { API_BASE, secureFetch } from "../../lib/api";
import { DiscoveryList } from "./discovery-list";
import { DiscoveryQuestionForm } from "./discovery-question-form";
import {
  metadataFor,
  moveItem,
  reorderError,
  responseError,
  type DiscoveryList as List,
  type Template,
} from "./discovery-types";

const ENDPOINT = `${API_BASE}/admin/onboarding-templates`;
const json = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Solo i campi del contratto: il codice e lo scope non passano dalla modifica. */
function payload(t: Template) {
  const meta = { ...t.optionsJson };
  meta.options = (meta.options ?? []).map((o) => ({
    ...o,
    value: o.value === "" ? o.label : o.value,
  }));
  for (const key of ["contextKey", "visibleWhen", "step", "target"] as const)
    if (meta[key] === undefined || meta[key] === "") delete meta[key];
  if (meta.ui && !Object.values(meta.ui).some((v) => v !== undefined))
    delete meta.ui;
  return {
    label: t.label,
    helpText: t.helpText || null,
    inputType: t.inputType,
    required: t.required,
    isActive: t.isActive,
    optionsJson: meta,
  };
}

export default function AdminDiscoveryPage() {
  const [list, setList] = useState<List>();
  const [draft, setDraft] = useState<Template>();
  const [savedOptionIds, setSavedOptionIds] = useState(new Set<string>());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await secureFetch(`${ENDPOINT}?scope=DISCOVERY`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error(await responseError(response));
    setList((await response.json()) as List);
  };
  useEffect(() => {
    void load().catch((e: Error) => setMessage(e.message));
  }, []);
  /** Ogni azione e subito operativa: in caso di errore la lista resta quella salvata. */
  const run = async (
    request: () => Promise<Response>,
    success: string,
    after?: (response: Response) => Promise<void>,
  ) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await request();
      if (!response.ok) throw new Error(await responseError(response));
      await (after ? after(response) : load());
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Connessione non disponibile",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!list)
    return (
      <ProductShell title="Discovery">
        <p role="status">{message || "Carichiamo le domande…"}</p>
      </ProductShell>
    );
  const { templates, stats, sportMode } = list;
  const edit = (template: Template) => {
    setMessage("");
    setDraft(structuredClone(template));
    setSavedOptionIds(
      new Set(template.optionsJson.options?.map((o) => o.id) ?? []),
    );
  };
  const move = (from: number, to: number) => {
    const next = moveItem(templates, from, to);
    const problem = reorderError(next, sportMode);
    if (problem) return setMessage(problem);
    void run(
      () =>
        secureFetch(
          `${ENDPOINT}/reorder`,
          json("POST", { ids: next.map((t) => t.id) }),
        ),
      "Nuovo ordine salvato.",
      async (response) => setList((await response.json()) as List),
    );
  };
  const duplicate = (t: Template) => {
    const used = new Set(templates.map((q) => q.key));
    let key = `${t.key}_copia`;
    for (let n = 2; used.has(key); n++) key = `${t.key}_copia_${n}`;
    // La copia nasce disattivata e senza target: si rivede prima di pubblicarla.
    const copy = { ...t, optionsJson: { ...t.optionsJson, target: undefined } };
    void run(
      () =>
        secureFetch(
          ENDPOINT,
          json("POST", {
            ...payload(copy),
            key,
            label: `${t.label} (copia)`,
            isActive: false,
            orderIndex: t.orderIndex + 1,
          }),
        ),
      `Copia creata e disattivata: «${t.label} (copia)».`,
    );
  };
  const save = () => {
    if (!draft) return;
    if (draft.optionsJson.visibleWhen?.rules.some((r) => !r.values.length))
      return setMessage("Scegli almeno un valore per ogni condizione.");
    void run(
      () =>
        draft.id
          ? secureFetch(
              `${ENDPOINT}/${draft.id}`,
              json("PATCH", payload(draft)),
            )
          : secureFetch(
              ENDPOINT,
              json("POST", { ...payload(draft), key: draft.key.trim() }),
            ),
      "Domanda salvata.",
    ).then((saved) => saved && setDraft(undefined));
  };
  return (
    <ProductShell
      title="Discovery"
      description={`Dati della configurazione. Quante domande vede un atleta dipende dal ramo: lo mostra l’anteprima.${sportMode === "fixed" ? " Con sport fisso sport e specializzazione restano fuori dal percorso." : ""}`}
      stats={[
        { label: "Configurate", value: stats.configured },
        { label: "Attive", value: stats.active },
        { label: "Sempre visibili", value: stats.unconditional },
        { label: "Condizionali", value: stats.conditional },
        {
          label: "Attive nel percorso",
          value: stats.activePathCount,
          tone: "accent",
        },
      ]}
      actions={
        <>
          <button
            type="button"
            className="pf-button"
            disabled={busy}
            onClick={() => {
              setSavedOptionIds(new Set());
              setDraft({
                key: "",
                label: "",
                helpText: "",
                inputType: "SELECT",
                required: true,
                isActive: true,
                orderIndex: 0,
                optionsJson: metadataFor("single_choice"),
              });
            }}
          >
            Nuova domanda
          </button>
          <a
            className="pf-button-secondary"
            href="/admin/discovery/preview"
            target="_blank"
            rel="noopener"
          >
            Anteprima discovery
          </a>
        </>
      }
    >
      {message && (
        <p role="status" className="pf-alert">
          {message}
        </p>
      )}
      {draft && (
        <DiscoveryQuestionForm
          draft={draft}
          savedOptionIds={savedOptionIds}
          templates={templates}
          busy={busy}
          onChange={setDraft}
          onSubmit={save}
          onCancel={() => setDraft(undefined)}
        />
      )}
      <DiscoveryList
        templates={templates}
        sportMode={sportMode}
        busy={busy}
        onMove={move}
        onEdit={edit}
        onDuplicate={duplicate}
        onToggle={(t) =>
          void run(
            () =>
              secureFetch(
                `${ENDPOINT}/${t.id}`,
                json("PATCH", { isActive: !t.isActive }),
              ),
            t.isActive ? `«${t.label}» disattivata.` : `«${t.label}» attivata.`,
          )
        }
        onDelete={(t) => {
          if (window.confirm(`Eliminare definitivamente «${t.label}»?`))
            void run(
              () => secureFetch(`${ENDPOINT}/${t.id}`, { method: "DELETE" }),
              `«${t.label}» eliminata.`,
            );
        }}
      />
    </ProductShell>
  );
}
