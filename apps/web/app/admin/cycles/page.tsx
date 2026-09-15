"use client";

import {
  EmptyState,
  ProductShell,
  StatusBadge,
} from "@/app/components/product-shell";
import { displayUser, formatDate, formatStatus } from "./admin-cycles-model";
import { AthleteAssignments } from "./athlete-assignments";
import { CoachAssignmentDialog } from "./coach-assignment-dialog";
import { CyclesReadyToPublish } from "./cycles-ready-to-publish";
import { ProfessionalAssignmentDialog } from "./professional-assignment-dialog";
import { ProfessionalCompetences } from "./professional-competences";
import { useAdminCycles } from "./use-admin-cycles";
export default function AdminCyclesPage() {
  const model = useAdminCycles();
  const {
    loading,
    message,
    busyKey,
    aiPreview,
    previewTarget,
    assignmentTarget,
    coachAssignmentTarget,
    resetTarget,
    setResetTarget,
    deleteTarget,
    setDeleteTarget,
    deleteConfirmText,
    setDeleteConfirmText,
    exportConfirmOpen,
    setExportConfirmOpen,
    readyToGenerate,
    readyTraining,
    waitingApproval,
    readyCycles,
    pendingActivation,
    professionalCanHandleArea,
    previewAthlete,
    previewLabel,
    previewIsTraining,
    loadDashboard,
    openAiPreview,
    openTrainingPreview,
    closeAiPreview,
    generateCycle,
    generateTraining,
    confirmExportActivePrompts,
    setAthleteActive,
    rejectAthleteApplication,
    resetAthleteData,
    deleteAthleteCompletely,
  } = model;
  return (
    <ProductShell
      eyebrow="Ambiente amministratore"
      title="Cruscotto operativo"
      description="Assegna un professionista per area atleta, genera cicli AI quando gli atleti sono pronti, traccia le approvazioni e pubblica senza copiare ID."
      actions={
        <>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => setExportConfirmOpen(true)}
            disabled={busyKey === "export-active-prompts"}
          >
            Export prompt AI
          </button>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => loadDashboard()}
          >
            Aggiorna
          </button>
        </>
      }
      stats={[
        {
          label: "Pronti da generare",
          value: loading ? "..." : readyToGenerate.length,
          tone: "accent",
        },
        {
          label: "Allenamenti generabili",
          value: loading ? "..." : readyTraining.length,
          tone: "success",
        },
        {
          label: "Approvazioni in attesa",
          value: loading ? "..." : waitingApproval.length,
          tone: "warning",
        },
        {
          label: "Pronti da pubblicare",
          value: loading ? "..." : readyCycles.length,
          tone: "success",
        },
        {
          label: "In attesa attivazione",
          value: loading ? "..." : pendingActivation.length,
          tone: pendingActivation.length ? "danger" : "neutral",
        },
      ]}
    >
      {message && <div className="pf-alert">{message}</div>}

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Nuove richieste atleta</h2>
            <p className="pf-muted">
              Gli atleti creati dall'accesso pubblico devono essere abilitati
              dall'amministratore prima di accedere e completare l'onboarding.
            </p>
          </div>
          <StatusBadge tone={pendingActivation.length ? "danger" : "success"}>
            {pendingActivation.length} in attesa
          </StatusBadge>
        </div>
        <div className="pf-table">
          {pendingActivation.map((athlete) => (
            <article key={athlete.id} className="pf-work-row">
              <div>
                <strong>{displayUser(athlete)}</strong>
                <p className="pf-muted">
                  Creato il {formatDate(athlete.createdAt)} - onboarding{" "}
                  {formatStatus(athlete.onboarding.status)}
                </p>
              </div>
              <button
                className="pf-button"
                type="button"
                disabled={busyKey === `active:${athlete.id}`}
                onClick={() => setAthleteActive(athlete.id, true)}
              >
                Abilita atleta
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === `reject:${athlete.id}`}
                onClick={() => rejectAthleteApplication(athlete.id)}
              >
                Rifiuta candidatura
              </button>
            </article>
          ))}
          {!loading && pendingActivation.length === 0 && (
            <EmptyState
              title="Nessun atleta in attesa"
              description="Le nuove richieste di registrazione atleta appariranno qui."
            />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Coda generazione AI</h2>
            <p className="pf-muted">
              Atleti con onboarding completato e aree pronte a ricevere una
              nuova proposta AI.
            </p>
          </div>
          <StatusBadge tone={readyToGenerate.length ? "accent" : "neutral"}>
            {readyToGenerate.length} pronti
          </StatusBadge>
        </div>
        <div className="pf-table">
          {readyToGenerate.map(({ athlete, state }) => {
            const linkedProfessionalCanApprove = Boolean(
              state.linkedProfessional &&
              professionalCanHandleArea(
                state.linkedProfessional.id,
                state.area.id,
              ),
            );
            return (
              <article
                key={`${athlete.id}:${state.area.id}`}
                className="pf-work-row"
              >
                <div>
                  <strong>{displayUser(athlete)}</strong>
                  <p className="pf-muted">
                    {state.area.name} - {state.reason}
                  </p>
                  {!linkedProfessionalCanApprove && (
                    <p className="pf-muted">
                      Assegna un professionista abilitato per {state.area.name}{" "}
                      prima di generare.
                    </p>
                  )}
                </div>
                <div className="pf-inline-metrics">
                  <span>R {state.snapshot?.realR.toFixed(0) ?? "-"}</span>
                  <span>P {state.snapshot?.potentialP.toFixed(0) ?? "-"}</span>
                </div>
                <button
                  className="pf-button"
                  type="button"
                  disabled={
                    busyKey === `preview:${athlete.id}:${state.area.id}` ||
                    !linkedProfessionalCanApprove
                  }
                  onClick={() => openAiPreview(athlete, state.area)}
                >
                  Anteprima AI
                </button>
              </article>
            );
          })}
          {!loading && readyToGenerate.length === 0 && (
            <EmptyState
              title="Niente da generare"
              description="Al momento nessuna area atleta completata e disponibile per una nuova proposta."
            />
          )}
        </div>
      </section>

      <section className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Allenamento autonomo</h2>
            <p className="pf-muted">
              Genera l'allenamento specifico dello sport-specializzazione usando
              i driver abilitati come contesto.
            </p>
          </div>
          <StatusBadge tone={readyTraining.length ? "success" : "neutral"}>
            {readyTraining.length} pronti
          </StatusBadge>
        </div>
        <div className="pf-table">
          {readyTraining.map((athlete) => (
            <article key={`training:${athlete.id}`} className="pf-work-row">
              <div>
                <strong>{displayUser(athlete)}</strong>
                <p className="pf-muted">{athlete.trainingState.reason}</p>
                {athlete.trainingState.sportSelection && (
                  <p className="pf-muted">
                    {athlete.trainingState.sportSelection.sport.label} -{" "}
                    {athlete.trainingState.sportSelection.specialization.label}{" "}
                    - allenatore:{" "}
                    {athlete.trainingState.linkedCoach?.email ??
                      "non assegnato"}
                  </p>
                )}
                {athlete.trainingState.activeTraining && (
                  <p className="pf-muted">
                    Ultimo allenamento v
                    {athlete.trainingState.activeTraining.version} -{" "}
                    {formatDate(athlete.trainingState.activeTraining.createdAt)}
                  </p>
                )}
              </div>
              <button
                className="pf-button"
                type="button"
                disabled={busyKey === `training-preview:${athlete.id}`}
                onClick={() => openTrainingPreview(athlete)}
              >
                Anteprima AI
              </button>
            </article>
          ))}
          {!loading && readyTraining.length === 0 && (
            <EmptyState
              title="Niente da generare"
              description="Al momento nessun atleta ha sport, onboarding e allenatore pronti per un nuovo allenamento."
            />
          )}
        </div>
      </section>

      <CyclesReadyToPublish model={model} />

      <AthleteAssignments model={model} />

      <ProfessionalCompetences model={model} />

      {assignmentTarget && <ProfessionalAssignmentDialog model={model} />}

      {coachAssignmentTarget && <CoachAssignmentDialog model={model} />}

      {resetTarget && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Conferma amministratore</p>
                <h2>Cancellare tutti i dati atleta?</h2>
                <p className="pf-muted">{displayUser(resetTarget.athlete)}</p>
              </div>
              <StatusBadge tone="danger">Azione irreversibile</StatusBadge>
            </div>
            <div className="pf-alert warning">
              Verranno cancellati consensi privacy/AI, onboarding, obiettivo,
              sport, assegnazioni, allenamenti, questionari, risposte, snapshot,
              storico, audit e dati AI collegati all'atleta. Resteranno solo
              account, password e identita login.
            </div>
            <div className="pf-actions">
              <button
                className="pf-button-danger"
                type="button"
                disabled={busyKey === `reset:${resetTarget.athlete.id}`}
                onClick={resetAthleteData}
              >
                Conferma cancellazione
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === `reset:${resetTarget.athlete.id}`}
                onClick={() => setResetTarget(null)}
              >
                Annulla
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Conferma amministratore</p>
                <h2>Eliminare definitivamente l'atleta?</h2>
                <p className="pf-muted">{displayUser(deleteTarget.athlete)}</p>
              </div>
              <StatusBadge tone="danger">Azione irreversibile</StatusBadge>
            </div>
            <div className="pf-alert warning">
              Verranno cancellati account, credenziali di login, identita
              collegate, consensi, onboarding, obiettivo, sport, assegnazioni,
              allenamenti, questionari, risposte, snapshot, storico, audit e
              dati AI collegati all'atleta.
            </div>
            <label className="pf-field">
              <span>Digita l'email dell'atleta per confermare</span>
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder={deleteTarget.athlete.email}
                autoComplete="off"
              />
            </label>
            <div className="pf-actions">
              <button
                className="pf-button-danger"
                type="button"
                disabled={
                  busyKey === `delete:${deleteTarget.athlete.id}` ||
                  deleteConfirmText !== deleteTarget.athlete.email
                }
                onClick={deleteAthleteCompletely}
              >
                Elimina definitivamente
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === `delete:${deleteTarget.athlete.id}`}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmText("");
                }}
              >
                Annulla
              </button>
            </div>
          </section>
        </div>
      )}

      {exportConfirmOpen && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal">
            <div className="pf-panel-header">
              <div>
                <h2>Esportare prompt AI attivi?</h2>
                <p className="pf-muted">
                  Il file contiene prompt AI e configurazioni correnti con
                  valore sensibile/IP. Non include versioni storiche, log, dati
                  utente, sessioni o segreti.
                </p>
              </div>
            </div>
            <div className="pf-actions">
              <button
                className="pf-button"
                type="button"
                disabled={busyKey === "export-active-prompts"}
                onClick={() => void confirmExportActivePrompts()}
              >
                {busyKey === "export-active-prompts"
                  ? "Export..."
                  : "Conferma export"}
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                disabled={busyKey === "export-active-prompts"}
                onClick={() => setExportConfirmOpen(false)}
              >
                Annulla
              </button>
            </div>
          </section>
        </div>
      )}

      {aiPreview && previewAthlete && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Anteprima AI</p>
                <h2>Contesto inviato all'AI</h2>
                <p className="pf-muted">
                  {previewAthlete.email} - {previewLabel} - {aiPreview.provider}
                  /{aiPreview.model}
                </p>
              </div>
              <StatusBadge tone="accent">{aiPreview.promptVersion}</StatusBadge>
            </div>

            <div className="pf-dashboard-grid">
              <article className="pf-review-section">
                <h4>Istruzione di sistema</h4>
                <p className="pf-muted">
                  {aiPreview.inputJson.prompt?.system ?? "-"}
                </p>
              </article>
              <article className="pf-review-section">
                <h4>Regole di generazione</h4>
                <pre className="pf-json-preview">
                  {JSON.stringify(
                    aiPreview.inputJson.prompt?.user?.constraints ?? {},
                    null,
                    2,
                  )}
                </pre>
              </article>
            </div>

            <article className="pf-review-section">
              <h4>Contesto atleta</h4>
              <pre className="pf-json-preview">
                {JSON.stringify(
                  aiPreview.inputJson.prompt?.user?.context ?? {},
                  null,
                  2,
                )}
              </pre>
            </article>

            <div className="pf-actions">
              <button
                className="pf-button"
                type="button"
                disabled={
                  previewTarget
                    ? busyKey ===
                      `generate:${previewTarget.athlete.id}:${previewTarget.area.id}`
                    : busyKey === `training:${previewAthlete.id}`
                }
                onClick={() =>
                  previewTarget
                    ? generateCycle(
                        previewTarget.athlete.id,
                        previewTarget.area.id,
                      )
                    : generateTraining(previewAthlete.id)
                }
              >
                {previewIsTraining
                  ? "Conferma e genera allenamento"
                  : "Conferma e invia all'AI"}
              </button>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={closeAiPreview}
              >
                Annulla
              </button>
            </div>
          </section>
        </div>
      )}
    </ProductShell>
  );
}
