"use client";

import { renderAreaConfigPrompts } from "./prompt-list-area-config";
import { renderGoalPrompts } from "./prompt-list-goal";
import { renderSportAreaPrompts } from "./prompt-list-sport-area";
import { renderTrainingPrompts } from "./prompt-list-training";
import { formatDate } from "./prompt-management-model";
import { promptModes } from "./prompt-model";
import type { PromptManagementModel } from "./use-prompt-management";
export function renderCreatedPromptsList(model: PromptManagementModel) {
  const {
    promptListMode,
    versionLabel,
    updatedAt,
    openPromptDetail,
    createNewDraft,
    getPromptOverview,
  } = model;

  const selectedMode = promptModes.find((item) => item.id === promptListMode);
  const listTitle = selectedMode?.title ?? "Prompt";

  if (promptListMode === "goal") {
    return renderGoalPrompts(model, listTitle);
  }

  if (promptListMode === "sport-area") {
    return renderSportAreaPrompts(model);
  }

  if (promptListMode === "area-config") {
    return renderAreaConfigPrompts(model);
  }

  if (promptListMode === "training") {
    return renderTrainingPrompts(model);
  }

  return (
    <section className="pf-stack">
      <section className="pf-panel pf-prompt-current-panel">
        <div className="pf-panel-header pf-prompt-current-header">
          <div>
            <h2>{listTitle}</h2>
            <p className="pf-muted">
              Prompt configurato per il contesto selezionato. Aprilo per vedere
              i dettagli completi.
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

        <div className="pf-grid pf-created-prompts-grid">
          <button
            type="button"
            className="pf-card pf-created-prompt-card in-use"
            onClick={() => openPromptDetail()}
          >
            <span className="pf-created-prompt-badge">In uso</span>
            <div className="pf-prompt-card-title">
              <h3>{listTitle}</h3>
            </div>
            <p>{getPromptOverview(promptListMode ?? "goal").description}</p>
            <div className="pf-prompt-overview-meta">
              <span>
                Versione
                <strong>{versionLabel ? `v${versionLabel}` : "-"}</strong>
              </span>
              <span>
                Ultima modifica
                <strong>{formatDate(updatedAt)}</strong>
              </span>
              <span>
                Stato
                <strong>In uso</strong>
              </span>
            </div>
          </button>
        </div>
      </section>
    </section>
  );
}
