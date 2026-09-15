"use client";

import { ProductShell } from "@/app/components/product-shell";
import { renderEditor } from "./prompt-management-editor";
import { renderSportSelectors } from "./prompt-management-sport-selectors";
import { usePromptManagement } from "./use-prompt-management";

export default function PromptManagementPage() {
  const model = usePromptManagement();
  const {
    mode,
    message,
    successPopup,
    setSuccessPopup,
    busyKey,
    editorOpen,
    promptListMode,
    sportAreaPromptListAreaId,
    areaConfigPromptListAreaId,
    trainingPromptListSpecializationId,
    activationTarget,
    setActivationTarget,
    exportConfirmOpen,
    setExportConfirmOpen,
    loadSettings,
    confirmActivation,
    confirmExportActivePrompts,
    promptBackAction,
    pageHeader,
  } = model;
  return (
    <ProductShell
      eyebrow={pageHeader.eyebrow}
      title={pageHeader.title}
      description={pageHeader.description}
      actions={
        <>
          <button
            className="pf-button-secondary"
            type="button"
            disabled={busyKey === "export-active-prompts"}
            onClick={() => setExportConfirmOpen(true)}
          >
            Export prompt attivi
          </button>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={loadSettings}
          >
            Aggiorna
          </button>
        </>
      }
      backAction={promptBackAction}
    >
      <div className="pf-prompt-management">
        {message && <div className="pf-alert warning">{message}</div>}
        {editorOpen &&
          mode === "sport-area" &&
          promptListMode !== "sport-area" &&
          !sportAreaPromptListAreaId &&
          renderSportSelectors(model, true)}
        {editorOpen &&
          mode === "training" &&
          promptListMode !== "training" &&
          !trainingPromptListSpecializationId &&
          renderSportSelectors(model, false)}
        {editorOpen &&
          mode === "area-config" &&
          promptListMode !== "area-config" &&
          !areaConfigPromptListAreaId &&
          renderSportSelectors(model, true)}
        {renderEditor(model)}
        {activationTarget && (
          <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
            <section className="pf-modal pf-confirm-modal">
              <div className="pf-panel-header">
                <div>
                  <h2>Attivare prompt?</h2>
                  <p className="pf-muted">
                    Sei sicuro di voler attivare? Il prompt verra attivato per
                    tutti gli utenti.
                  </p>
                </div>
              </div>
              <div className="pf-form-actions">
                <button
                  type="button"
                  className="pf-button"
                  disabled={busyKey?.startsWith("activate-")}
                  onClick={confirmActivation}
                >
                  {busyKey?.startsWith("activate-")
                    ? "Attivazione..."
                    : "Conferma"}
                </button>
                <button
                  type="button"
                  className="pf-button-secondary"
                  disabled={busyKey?.startsWith("activate-")}
                  onClick={() => setActivationTarget(null)}
                >
                  Annulla
                </button>
              </div>
            </section>
          </div>
        )}
        {exportConfirmOpen && (
          <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
            <section className="pf-modal pf-confirm-modal">
              <div className="pf-panel-header">
                <div>
                  <h2>Esportare prompt attivi?</h2>
                  <p className="pf-muted">
                    Il file contiene prompt AI e configurazioni correnti con
                    valore sensibile/IP. Le versioni storiche, i log, i dati
                    utente e i segreti non verranno esportati.
                  </p>
                </div>
              </div>
              <div className="pf-form-actions">
                <button
                  type="button"
                  className="pf-button"
                  disabled={busyKey === "export-active-prompts"}
                  onClick={() => void confirmExportActivePrompts()}
                >
                  {busyKey === "export-active-prompts"
                    ? "Export..."
                    : "Conferma export"}
                </button>
                <button
                  type="button"
                  className="pf-button-secondary"
                  disabled={busyKey === "export-active-prompts"}
                  onClick={() => setExportConfirmOpen(false)}
                >
                  Annulla
                </button>
              </div>
            </section>
          </div>
        )}
        {successPopup && (
          <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
            <section className="pf-modal pf-confirm-modal">
              <div className="pf-panel-header">
                <div>
                  <h2>Azione completata</h2>
                  <p className="pf-muted">{successPopup}</p>
                </div>
              </div>
              <div className="pf-form-actions">
                <button
                  type="button"
                  className="pf-button"
                  onClick={() => setSuccessPopup(null)}
                >
                  OK
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </ProductShell>
  );
}
