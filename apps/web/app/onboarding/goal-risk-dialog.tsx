"use client";

import type { OnboardingModel } from "./use-onboarding";
export function GoalRiskDialog({ model }: { model: OnboardingModel }) {
  const {
    goalText,
    setGoalValidation,
    setMessage,
    setMessageTone,
    setGoalRiskModalOpen,
    pendingGoalRisk,
    setGoalRiskAcknowledged,
    setFinalGoalValidated,
    validatingFinalGoal,
    openGoalRevisionFromRisk,
    confirmSuggestedGoalFromRisk,
  } = model;
  if (!pendingGoalRisk) return null;
  return (
    <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
      <section className="pf-modal pf-goal-modal">
        <div className="pf-panel-header">
          <div>
            <p className="pf-eyebrow">Validazione obiettivo</p>
            <h2>Obiettivo non realistico</h2>
            <p className="pf-muted">
              L'AI ha valutato l'obiettivo rispetto alle risposte inserite.
            </p>
          </div>
        </div>

        <div className="pf-alert warning">
          <strong>Valutazione AI</strong>
          <p>
            {pendingGoalRisk.goalValidation?.userMessage ??
              pendingGoalRisk.message ??
              "Date le risposte attuali, l'obiettivo non risulta realistico."}
          </p>
          <p>
            Puoi procedere con la performance, ma l'obiettivo viene salvato come
            irrealistico rispetto ai dati attuali.
          </p>
        </div>

        {pendingGoalRisk.goalValidation?.suggestedReformulatedGoal && (
          <div className="pf-goal-draft">
            <span>Possibile riformulazione</span>
            <strong>
              {pendingGoalRisk.goalValidation.suggestedReformulatedGoal}
            </strong>
          </div>
        )}

        <div className="pf-actions">
          {pendingGoalRisk.goalValidation?.suggestedReformulatedGoal && (
            <button
              className="pf-button"
              type="button"
              disabled={validatingFinalGoal}
              onClick={() => void confirmSuggestedGoalFromRisk()}
            >
              Conferma obiettivo AI
            </button>
          )}
          <button
            className="pf-button-secondary"
            type="button"
            onClick={openGoalRevisionFromRisk}
          >
            Chatta con AI per modifica
          </button>
          <button
            className="pf-button-secondary"
            type="button"
            onClick={() => {
              setGoalRiskAcknowledged(true);
              setFinalGoalValidated(true);
              setGoalValidation({
                status:
                  pendingGoalRisk.goalValidation?.status ??
                  "GOAL_NEEDS_REFORMULATION",
                accepted: false,
                canProceedToAnamnesis: false,
                interpretedGoal:
                  pendingGoalRisk.goalValidation?.interpretedGoal ?? goalText,
                userMessage:
                  pendingGoalRisk.goalValidation?.userMessage ??
                  pendingGoalRisk.message ??
                  "Obiettivo salvato come non realistico rispetto ai dati attuali.",
                suggestedReformulatedGoal:
                  pendingGoalRisk.goalValidation?.suggestedReformulatedGoal ??
                  null,
                questionsToUser:
                  pendingGoalRisk.goalValidation?.questionsToUser ?? [],
                nextStep: pendingGoalRisk.goalValidation?.nextStep ?? null,
                rejectionReason:
                  pendingGoalRisk.goalValidation?.rejectionReason ??
                  pendingGoalRisk.message ??
                  null,
              });
              setGoalRiskModalOpen(false);
              setMessageTone("warning");
              setMessage(
                "Presa visione confermata. Ora puoi creare la performance.",
              );
            }}
          >
            Procedi comunque
          </button>
        </div>
      </section>
    </div>
  );
}
