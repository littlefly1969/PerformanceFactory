"use client";

import { useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { formatDate } from "../prompt-management-model";
import {
  type AssessmentPrompt,
  type AssessmentPromptKind,
  useAssessmentPrompts,
} from "./use-assessment-prompts";

/** Testi delle tre famiglie di prompt: valutazione, domande di calibrazione, micro-test su misura. */
const COPY = {
  EVALUATION: {
    title: "Valutazione dell'assessment",
    description:
      "Prompt AI_ASSESSMENT che, alla fine dell'assessment e dopo ogni round di calibrazione, stima la R provvisoria di ogni driver con confidenza e motivazione.",
    usedBy: "tutte le nuove valutazioni",
    instructions: "Istruzioni di valutazione (modificabili)",
    rules:
      "un punteggio per ogni driver nella scala attiva, confidenza 0–100 separata dal punteggio, livello e commitment, motivazione e cosa manca per aumentare la confidenza",
    activation: "Le prossime valutazioni di tutti gli atleti useranno",
  },
  CALIBRATION: {
    title: "Domande di calibrazione",
    description:
      "Prompt che, a ogni round della calibrazione gratuita, scrive nuove domande sui driver con la confidenza più bassa partendo dalle lacune indicate dalla valutazione.",
    usedBy: "tutti i nuovi round di domande",
    instructions: "Istruzioni per le domande (modificabili)",
    rules:
      "esattamente le domande richieste per ogni driver, da 3 a 5 opzioni con uno score nella scala attiva, testi brevi",
    activation: "I prossimi round di domande di tutti gli atleti useranno",
  },
  MICRO_TEST: {
    title: "Micro-test su misura",
    description:
      "Prompt che, dopo ogni valutazione della calibrazione, scrive per l'atleta un micro-test pratico su ciascuno dei driver meno affidabili, partendo dalla sua storia: profilo, risposte, micro-test fatti e feedback del coach. Attivo con il flag ai_micro_tests; senza, restano i micro-test del catalogo.",
    usedBy: "tutti i nuovi lotti di micro-test",
    instructions: "Istruzioni per i micro-test (modificabili)",
    rules:
      "un micro-test per ogni driver ricevuto, titolo e istruzioni brevi, da 3 a 5 esiti con score crescenti nella scala attiva, titoli mai già proposti",
    activation: "I prossimi micro-test su misura di tutti gli atleti useranno",
  },
} as const;

export function AssessmentPromptEditor({
  kind,
}: {
  kind: AssessmentPromptKind;
}) {
  const copy = COPY[kind];
  const {
    prompts,
    draft,
    setDraft,
    changed,
    busy,
    message,
    test,
    save,
    activate,
    runTest,
    testCases,
    testCaseId,
    setTestCaseId,
  } = useAssessmentPrompts(kind);
  const [confirm, setConfirm] = useState<AssessmentPrompt | null>(null);
  return (
    <ProductShell
      eyebrow="AI Tuner · Prompt"
      title={copy.title}
      description={copy.description}
    >
      <div className="pf-prompt-management">
        {message && <div className="pf-alert warning">{message}</div>}
        <section className="pf-panel pf-prompt-current-panel">
          <div className="pf-panel-header">
            <div>
              <h2>Versioni</h2>
              <p className="pf-muted">
                Quella evidenziata è usata per {copy.usedBy}. Ogni risultato
                salvato ricorda la versione con cui è stato prodotto.
              </p>
            </div>
          </div>
          <div className="pf-grid pf-created-prompts-grid">
            {prompts.map((item) => (
              <article
                key={item.id}
                className={`pf-card pf-created-prompt-card ${item.isActive ? "in-use" : ""}`}
                role="button"
                tabIndex={0}
                aria-pressed={draft?.id === item.id}
                onClick={() => setDraft(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setDraft(item);
                  }
                }}
              >
                {item.isActive && (
                  <span className="pf-created-prompt-badge">In uso</span>
                )}
                <div className="pf-prompt-card-title">
                  <h3>{item.name}</h3>
                </div>
                <div className="pf-prompt-overview-meta">
                  <span>
                    Versione<strong>v{item.version}</strong>
                  </span>
                  <span>
                    Ultima modifica<strong>{formatDate(item.updatedAt)}</strong>
                  </span>
                </div>
                {!item.isActive && (
                  <button
                    type="button"
                    className="pf-button"
                    disabled={busy === `activate-${item.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setConfirm(item);
                    }}
                  >
                    Rendi attivo
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>

        {draft && (
          <section className="pf-panel">
            <label className="pf-field">
              Nome prompt
              <input
                className="pf-input"
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label className="pf-field">
              {copy.instructions}
              <textarea
                className="pf-textarea pf-prompt-textarea"
                rows={16}
                value={draft.basePrompt}
                onChange={(event) =>
                  setDraft({ ...draft, basePrompt: event.target.value })
                }
              />
            </label>
            <p className="pf-muted">
              Il formato di risposta non si modifica qui: il sistema aggiunge
              sempre le regole fisse ({copy.rules}) e scarta ogni risposta che
              non le rispetta. Il potenziale P3/P6/P12 non viene chiesto.
            </p>
            <div className="pf-form-actions">
              <button
                type="button"
                className="pf-button-secondary"
                disabled={
                  busy === "save" || !changed || !draft.basePrompt.trim()
                }
                onClick={() => void save()}
              >
                {busy === "save" ? "Salvataggio..." : "Salva bozza"}
              </button>
              <button
                type="button"
                className="pf-button-secondary"
                disabled={busy === "test" || !draft.basePrompt.trim()}
                onClick={() => void runTest()}
              >
                {busy === "test" ? "Prova in corso..." : "Prova la bozza"}
              </button>
            </div>
            {kind === "EVALUATION" ? (
              <>
                <label className="pf-field">
                  Caso di prova
                  <select
                    className="pf-input"
                    value={testCaseId}
                    onChange={(event) => setTestCaseId(event.target.value)}
                  >
                    <option value="">Caso sintetico (nessun dato reale)</option>
                    {testCases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.athlete} · {formatDate(c.createdAt)} · {c.provider}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="pf-muted">
                  Una valutazione reale viene inviata a un provider esterno solo
                  se l&apos;atleta ha il consenso AI attivo in quel momento.
                </p>
              </>
            ) : (
              <p className="pf-muted">
                La prova usa il caso sintetico, con due driver a confidenza
                bassa: nessun dato reale lascia il sistema.
              </p>
            )}
          </section>
        )}

        {test && "questions" in test.output && (
          <section className="pf-panel" aria-label="Risultato della prova">
            <h2>Risultato della prova</h2>
            <p className="pf-muted">
              {test.provider} · {test.model} · {test.latencyMs} ms. Non salvato.
            </p>
            {test.output.questions.map((q) => (
              <article className="pf-card" key={q.id}>
                <h3>
                  {q.name ?? q.areaId} · {q.text}
                </h3>
                <ul className="pf-muted">
                  {q.options.map((o) => (
                    <li key={o.value}>
                      {o.label} · score {o.score}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        )}

        {test && "tests" in test.output && (
          <section className="pf-panel" aria-label="Risultato della prova">
            <h2>Risultato della prova</h2>
            <p className="pf-muted">
              {test.provider} · {test.model} · {test.latencyMs} ms. Non salvato.
            </p>
            {test.output.tests.map((t) => (
              <article className="pf-card" key={t.areaId}>
                <h3>
                  {t.name ?? t.areaId} · {t.title}
                </h3>
                <p>{t.instructions}</p>
                <ul className="pf-muted">
                  {t.options.map((o) => (
                    <li key={o.value}>
                      {o.label} · score {o.score}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        )}

        {test && "drivers" in test.output && (
          <section className="pf-panel" aria-label="Risultato della prova">
            <h2>Risultato della prova</h2>
            <p className="pf-muted">
              {test.provider} · {test.model} · {test.latencyMs} ms · confidenza
              complessiva {test.output.overallConfidence}/100. Non salvato.
            </p>
            <p>{test.output.summary}</p>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>R</th>
                  <th>Confidenza</th>
                  <th>Motivazione</th>
                </tr>
              </thead>
              <tbody>
                {test.output.drivers.map((d) => (
                  <tr key={d.areaId}>
                    <td>{d.name ?? d.areaId}</td>
                    <td>{d.score}</td>
                    <td>{d.confidence}</td>
                    <td>
                      {d.rationale}
                      {d.evidenceGaps.length > 0 && ` Per affinare: ${d.evidenceGaps.join(" ")}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {confirm && (
          <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
            <section className="pf-modal pf-confirm-modal">
              <h2>Attivare prompt?</h2>
              <p className="pf-muted">
                {copy.activation} “{confirm.name}”.
              </p>
              <div className="pf-form-actions">
                <button
                  type="button"
                  className="pf-button"
                  onClick={() => {
                    void activate(confirm);
                    setConfirm(null);
                  }}
                >
                  Conferma
                </button>
                <button
                  type="button"
                  className="pf-button-secondary"
                  onClick={() => setConfirm(null)}
                >
                  Annulla
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </ProductShell>
  );
}
