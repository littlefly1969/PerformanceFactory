"use client";
import { useEffect, useState } from "react";
import { ProductShell } from "../../components/product-shell";
import { API_BASE, secureFetch } from "../../lib/api";
import { moveItem, responseError } from "../discovery/discovery-types";
import { AssessmentList } from "./assessment-list";
import { AssessmentQuestionForm } from "./assessment-question-form";
import type {
  AssessmentDraft,
  AssessmentList as List,
} from "./assessment-types";

const ENDPOINT = `${API_BASE}/admin/assessment-templates`;
const json = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export default function AdminAssessmentPage() {
  const [list, setList] = useState<List>();
  const [draft, setDraft] = useState<AssessmentDraft>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await secureFetch(ENDPOINT, { credentials: "include" });
    if (!response.ok) throw new Error(await responseError(response));
    setList((await response.json()) as List);
  };
  useEffect(() => {
    void load().catch((e: Error) => setMessage(e.message));
  }, []);
  /** Ogni azione e subito operativa per i nuovi assessment; gli errori del backend si mostrano come sono. */
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
      <ProductShell title="Assessment">
        <p role="status">{message || "Carichiamo le domande…"}</p>
      </ProductShell>
    );
  const area = draft && list.areas.find((a) => a.id === draft.areaId);
  const save = () => {
    if (!draft) return;
    const body = {
      label: draft.label,
      helpText: draft.helpText || null,
      options: draft.options.map((o) => ({ ...o, score: Number(o.score) })),
    };
    void run(
      () =>
        draft.id
          ? secureFetch(`${ENDPOINT}/${draft.id}`, json("PATCH", body))
          : secureFetch(
              ENDPOINT,
              json("POST", {
                ...body,
                areaId: draft.areaId,
                isActive: draft.isActive,
              }),
            ),
      "Domanda salvata.",
    ).then((saved) => saved && setDraft(undefined));
  };
  return (
    <ProductShell
      title="Assessment"
      description={`Le domande operative sono di sistema e restano bloccate. Ogni driver attivo ha esattamente ${list.expectedPerArea} domande; i salvataggi valgono per i nuovi assessment.`}
      stats={[
        { label: "Domande operative", value: list.stats.fixedQuestionCount },
        { label: "Domande driver", value: list.stats.areaQuestionCount },
        { label: "Totale assessment", value: list.stats.count, tone: "accent" },
        { label: "Minuti stimati", value: list.stats.estimatedMinutes },
      ]}
    >
      {list.problems.length > 0 && (
        <div role="alert" className="pf-alert">
          <p>
            Configurazione non valida: l’assessment non parte finché non la
            correggi.
          </p>
          <ul>
            {list.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      {message && (
        <p role="status" className="pf-alert">
          {message}
        </p>
      )}
      {draft && area && (
        <AssessmentQuestionForm
          draft={draft}
          areaName={area.name}
          busy={busy}
          onChange={setDraft}
          onSubmit={save}
          onCancel={() => setDraft(undefined)}
        />
      )}
      <AssessmentList
        list={list}
        busy={busy}
        onEdit={(q, a) => {
          setMessage("");
          setDraft({
            id: q.id,
            areaId: a.id,
            label: q.label,
            helpText: q.helpText ?? "",
            isActive: q.isActive,
            options: structuredClone(q.options),
          });
        }}
        onAdd={(a) => {
          setMessage("");
          setDraft({
            areaId: a.id,
            label: "",
            helpText: "",
            isActive: true,
            options: [
              { value: "0", label: "", score: "" },
              { value: "1", label: "", score: "" },
            ],
          });
        }}
        onMove={(a, from, to) =>
          void run(
            () =>
              secureFetch(
                `${ENDPOINT}/reorder`,
                json("POST", {
                  areaId: a.id,
                  ids: moveItem(a.templates, from, to).map((t) => t.id),
                }),
              ),
            "Nuovo ordine salvato.",
            async (response) => setList((await response.json()) as List),
          )
        }
        onToggle={(q) =>
          void run(
            () =>
              secureFetch(
                `${ENDPOINT}/${q.id}`,
                json("PATCH", { isActive: !q.isActive }),
              ),
            q.isActive ? `«${q.label}» disattivata.` : `«${q.label}» attivata.`,
          )
        }
        onDelete={(q) => {
          if (window.confirm(`Eliminare definitivamente «${q.label}»?`))
            void run(
              () => secureFetch(`${ENDPOINT}/${q.id}`, { method: "DELETE" }),
              `«${q.label}» eliminata.`,
            );
        }}
      />
    </ProductShell>
  );
}
