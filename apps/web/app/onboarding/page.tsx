"use client";

import { ProductShell, StatusBadge } from "@/app/components/product-shell";
import { GoalRiskDialog } from "./goal-risk-dialog";
import { OnboardingQuestionnaire } from "./onboarding-questionnaire";
import { useOnboarding } from "./use-onboarding";
export default function OnboardingPage() {
  const model = useOnboarding();
  const {
    questionnaire,
    goalText,
    selectedSpecializationId,
    sportSelectionSaved,
    goalValidation,
    answers,
    result,
    message,
    messageTone,
    loading,
    goalModalOpen,
    setGoalModalOpen,
    goalChatMessages,
    goalChatInput,
    setGoalChatInput,
    refinedGoalDraft,
    refiningGoal,
    setGoalAssistantClosed,
    flowStep,
    goalRiskModalOpen,
    pendingGoalRisk,
    warningPopup,
    setWarningPopup,
    goalConfirmed,
    selectedSport,
    refineGoal,
    useRefinedGoal,
  } = model;
  return (
    <ProductShell
      eyebrow="Onboarding atleta"
      title={
        flowStep === "ANAMNESIS" ? "Anamnesi iniziale" : "Definizione obiettivo"
      }
      description={
        flowStep === "ANAMNESIS"
          ? "Completa sport e dati anamnestici. L'obiettivo viene definito nello step successivo."
          : "Definisci l'obiettivo usando i dati appena inseriti; l'AI validera il realismo alla fine."
      }
      actions={
        result ? (
          <button
            className="pf-button"
            type="button"
            onClick={() => {
              window.location.href = "/user";
            }}
          >
            Entra nell'ambiente
          </button>
        ) : null
      }
      stats={[
        {
          label: "Stato",
          value: loading ? "..." : (questionnaire?.status ?? "-"),
          tone: questionnaire?.required ? "warning" : "success",
        },
        {
          label: "Sport",
          value: selectedSport ? (selectedSpecializationId ? "1" : "-") : "-",
          tone: sportSelectionSaved ? "success" : "warning",
        },
        {
          label: "Risposte",
          value: questionnaire
            ? `${Object.keys(answers).length}/${questionnaire.questions.length}`
            : "-",
          tone: "accent",
        },
        {
          label: "Obiettivo",
          value:
            flowStep === "ANAMNESIS"
              ? "Dopo anamnesi"
              : goalConfirmed
                ? "Pronto"
                : goalText.trim()
                  ? "Da confermare"
                  : "-",
          tone: goalConfirmed ? "success" : "warning",
        },
      ]}
    >
      {message && <div className={`pf-alert ${messageTone}`}>{message}</div>}

      <OnboardingQuestionnaire model={model} />
      {goalModalOpen && (
        <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
          <section className="pf-modal pf-goal-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Assistente obiettivo</p>
                <h2>Definisci meglio il tuo obiettivo</h2>
                <p className="pf-muted">
                  Rispondi solo alle informazioni richieste. L'AI mantiene il
                  contesto gia scritto e aggiorna progressivamente la bozza.
                </p>
              </div>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={() => {
                  setGoalModalOpen(false);
                  if (goalValidation?.canProceedToAnamnesis) {
                    setGoalAssistantClosed(true);
                  }
                }}
              >
                Chiudi
              </button>
            </div>

            <div className="pf-goal-draft">
              <span>Bozza obiettivo</span>
              <strong>{refinedGoalDraft || goalText}</strong>
            </div>

            <div className="pf-goal-chat">
              {goalChatMessages.map((item, index) => (
                <div
                  key={`${item.role}-${index}`}
                  className={`pf-goal-message ${item.role}`}
                >
                  <span>{item.role === "assistant" ? "AI" : "Tu"}</span>
                  <p>{item.content}</p>
                </div>
              ))}
            </div>

            <label className="pf-field">
              {goalValidation?.canProceedToAnamnesis
                ? "Aggiungi dettagli all'obiettivo"
                : "Risposta"}
              <textarea
                className="pf-textarea"
                rows={3}
                value={goalChatInput}
                onChange={(event) => setGoalChatInput(event.target.value)}
                placeholder={
                  goalValidation?.canProceedToAnamnesis
                    ? "Opzionale: aggiungi un dettaglio su risultato, misura, scadenza o punto di partenza."
                    : "Rispondi solo alla domanda dell'AI, senza riscrivere tutto."
                }
              />
            </label>

            <div className="pf-actions">
              <button
                className="pf-button-secondary"
                type="button"
                disabled={refiningGoal || !goalChatInput.trim()}
                onClick={refineGoal}
              >
                {refiningGoal ? "Analisi..." : "Invia risposta"}
              </button>
              <button
                className="pf-button"
                type="button"
                disabled={!goalValidation?.canProceedToAnamnesis}
                onClick={useRefinedGoal}
              >
                Conferma e chiudi
              </button>
            </div>
          </section>
        </div>
      )}
      {warningPopup && (
        <div className="pf-modal-backdrop" role="alertdialog" aria-modal="true">
          <section className="pf-modal pf-goal-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Avviso</p>
                <h2>{warningPopup.title}</h2>
              </div>
              <StatusBadge tone="warning">Attenzione</StatusBadge>
            </div>
            <div className="pf-alert warning">
              <p>{warningPopup.message}</p>
            </div>
            <div className="pf-actions">
              <button
                className="pf-button"
                type="button"
                onClick={() => setWarningPopup(null)}
              >
                OK
              </button>
            </div>
          </section>
        </div>
      )}
      {goalRiskModalOpen && pendingGoalRisk && <GoalRiskDialog model={model} />}
    </ProductShell>
  );
}
