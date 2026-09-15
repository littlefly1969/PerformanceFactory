"use client";

import { EmptyState } from "@/app/components/product-shell";
import { renderCreatedPromptsList } from "./prompt-management-created-prompts-list";
import { formatDate } from "./prompt-management-model";
import { renderPromptOverview } from "./prompt-management-prompt-overview";
import type { PromptManagementModel } from "./use-prompt-management";
export function renderEditor(model: PromptManagementModel) {
  const {
    settings,
    mode,
    busyKey,
    editorOpen,
    promptListMode,
    goalDraft,
    setGoalDraft,
    sportAreaPrompt,
    setSportAreaPrompt,
    trainingPrompt,
    setTrainingPrompt,
    areaInitialContext,
    setAreaInitialContext,
    areaResponseFormat,
    setAreaResponseFormat,
    areaLayoutText,
    setAreaLayoutText,
    selectedSport,
    selectedSpecialization,
    canSaveDraft,
    currentAreaName,
    currentPromptIsActive,
    statusLabel,
    versionLabel,
    updatedAt,
    editorDescription,
    requestActivateCurrentPrompt,
    saveDraft,
  } = model;

  if (!settings) {
    return (
      <EmptyState
        title="Caricamento prompt"
        description="Recupero configurazione da Gestione prompt."
      />
    );
  }

  if (!editorOpen) {
    if (promptListMode) {
      return renderCreatedPromptsList(model);
    }
    return renderPromptOverview(model);
  }

  return (
    <section className="pf-stack">
      <article className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Dettaglio prompt</h2>
            <p className="pf-muted">{editorDescription}</p>
          </div>
        </div>

        <div className="pf-stack">
          <section className="pf-prompt-status-grid" aria-label="Stato prompt">
            <div>
              <span>Stato</span>
              <strong>{statusLabel}</strong>
            </div>
            <div>
              <span>Versione</span>
              <strong>{versionLabel ? `v${versionLabel}` : "-"}</strong>
            </div>
            <div>
              <span>Ultima modifica</span>
              <strong>{formatDate(updatedAt)}</strong>
            </div>
            <div className="pf-prompt-status-action">
              <span>Attivazione</span>
              <button
                type="button"
                className="pf-button-secondary"
                disabled={
                  currentPromptIsActive || busyKey?.startsWith("activate-")
                }
                onClick={requestActivateCurrentPrompt}
              >
                {currentPromptIsActive ? "Prompt attivo" : "Rendi attivo"}
              </button>
            </div>
          </section>

          {mode === "goal" && (
            <>
              <label className="pf-field">
                Nome prompt
                <input
                  className="pf-input"
                  value={goalDraft.name}
                  onChange={(event) =>
                    setGoalDraft((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="pf-field">
                Prompt di validazione obiettivo
                <textarea
                  className="pf-textarea pf-prompt-textarea"
                  rows={16}
                  value={goalDraft.basePrompt}
                  onChange={(event) =>
                    setGoalDraft((prev) => ({
                      ...prev,
                      basePrompt: event.target.value,
                    }))
                  }
                />
              </label>
            </>
          )}

          {mode === "sport-area" && (
            <>
              <label className="pf-field">
                Istruzioni per l'area: {currentAreaName}
                <textarea
                  className="pf-textarea pf-prompt-textarea"
                  rows={18}
                  value={sportAreaPrompt}
                  onChange={(event) => setSportAreaPrompt(event.target.value)}
                />
              </label>
            </>
          )}

          {mode === "training" && (
            <>
              <label className="pf-field">
                Istruzioni allenamento - {selectedSport?.label ?? "Sport"} /{" "}
                {selectedSpecialization?.label ?? "Specializzazione"}
                <textarea
                  className="pf-textarea pf-prompt-textarea"
                  rows={18}
                  value={trainingPrompt}
                  onChange={(event) => setTrainingPrompt(event.target.value)}
                />
              </label>
            </>
          )}

          {mode === "area-config" && (
            <>
              <label className="pf-field">
                Istruzioni di generazione - {currentAreaName}
                <textarea
                  className="pf-textarea pf-prompt-textarea"
                  rows={9}
                  value={areaInitialContext}
                  onChange={(event) =>
                    setAreaInitialContext(event.target.value)
                  }
                />
              </label>
              <label className="pf-field">
                Formato della proposta
                <textarea
                  className="pf-textarea pf-prompt-textarea"
                  rows={7}
                  value={areaResponseFormat}
                  onChange={(event) =>
                    setAreaResponseFormat(event.target.value)
                  }
                />
              </label>
              <label className="pf-field">
                Questionario di monitoraggio
                <textarea
                  className="pf-textarea pf-mono pf-prompt-textarea"
                  rows={8}
                  value={areaLayoutText}
                  onChange={(event) => setAreaLayoutText(event.target.value)}
                />
              </label>
            </>
          )}

          <div className="pf-form-actions">
            <button
              className="pf-button-secondary pf-save-draft-button"
              type="button"
              disabled={busyKey === "save" || !canSaveDraft}
              onClick={saveDraft}
            >
              {busyKey === "save" ? "Salvataggio..." : "Salva bozza"}
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
