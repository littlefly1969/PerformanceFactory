"use client";

import { EmptyState } from "@/app/components/product-shell";
import { formatDate } from "./prompt-management-model";
import type { PromptManagementModel } from "./use-prompt-management";
export function renderGoalPrompts(
  model: PromptManagementModel,
  listTitle: string,
) {
  const {
    busyKey,
    goalPromptConfigs,
    requestActivateGoalPrompt,
    openPromptDetail,
    createNewDraft,
  } = model;

  return (
    <section className="pf-stack">
      <section className="pf-panel pf-prompt-current-panel">
        <div className="pf-panel-header pf-prompt-current-header">
          <div>
            <h2>{listTitle}</h2>
            <p className="pf-muted">
              Lista dei prompt creati. Quello evidenziato in giallo e il prompt
              attualmente usato dal sistema.
            </p>
          </div>
          <div className="pf-actions pf-prompt-current-actions">
            <button
              className="pf-button"
              type="button"
              onClick={createNewDraft}
            >
              Crea nuova bozza
            </button>
          </div>
        </div>

        {goalPromptConfigs.length === 0 ? (
          <EmptyState
            title="Nessun prompt creato"
            description="Crea una nuova bozza per iniziare."
          />
        ) : (
          <div className="pf-grid pf-created-prompts-grid">
            {goalPromptConfigs.map((item) => (
              <article
                key={item.id ?? item.name}
                className={`pf-card pf-created-prompt-card ${
                  item.isActive ? "in-use" : ""
                }`}
                role="button"
                tabIndex={0}
                onClick={() => openPromptDetail(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openPromptDetail(item);
                  }
                }}
              >
                {item.isActive && (
                  <span className="pf-created-prompt-badge">In uso</span>
                )}
                <div className="pf-prompt-card-title">
                  <h3>{item.name || "Validazione obiettivo"}</h3>
                </div>
                <p>
                  Prompt di validazione obiettivo per controllare chiarezza,
                  coerenza e sicurezza prima della generazione del percorso.
                </p>
                <div className="pf-created-prompt-footer">
                  <div className="pf-prompt-overview-meta">
                    <span>
                      Versione
                      <strong>{item.version ? `v${item.version}` : "-"}</strong>
                    </span>
                    <span>
                      Ultima modifica
                      <strong>{formatDate(item.updatedAt)}</strong>
                    </span>
                    <span>
                      Stato
                      <strong>
                        {item.isActive ? "In uso" : "Bozza / non attivo"}
                      </strong>
                    </span>
                  </div>
                  {!item.isActive && (
                    <div className="pf-created-prompt-actions">
                      <button
                        type="button"
                        className="pf-button-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          openPromptDetail(item);
                        }}
                      >
                        Apri prompt
                      </button>
                      <button
                        type="button"
                        className="pf-button"
                        disabled={busyKey === `activate-${item.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          requestActivateGoalPrompt(item);
                        }}
                      >
                        {busyKey === `activate-${item.id}`
                          ? "Attivazione..."
                          : "Rendi attivo"}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
