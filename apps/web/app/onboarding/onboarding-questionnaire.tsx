"use client";

import { StatusBadge } from "@/app/components/product-shell";
import { RadarChart } from "@/app/components/radar-chart";
import type { OnboardingModel } from "./use-onboarding";
export function OnboardingQuestionnaire({ model }: { model: OnboardingModel }) {
  const {
    questionnaire,
    goalText,
    setGoalText,
    selectedSportId,
    setSelectedSportId,
    selectedSpecializationId,
    setSelectedSpecializationId,
    sportSelectionSaved,
    setSportSelectionSaved,
    goalValidation,
    setGoalValidation,
    answers,
    submitting,
    generatingSpecialistQuestions,
    refinedGoalDraft,
    goalAssistantClosed,
    setGoalAssistantClosed,
    flowStep,
    setPendingGoalRisk,
    goalRiskAcknowledged,
    setGoalRiskAcknowledged,
    finalGoalValidated,
    setFinalGoalValidated,
    validatingFinalGoal,
    redirecting,
    radarAree,
    goalIsValidated,
    specialistQuestionsGenerated,
    visibleQuestions,
    goalConfirmed,
    sports,
    specializationOptions,
    sportSelectionValid,
    generalAnswersComplete,
    generalComplete,
    completed,
    canCreatePerformance,
    validationLocksQuestionList,
    specialistScoreOptions,
    showGoalValidationResult,
    missingRequiredAnswers,
    openGoalConfirmation,
    saveSportSelection,
    setQuestionAnswer,
    confirmAnamnesis,
    confirmGoalContext,
    generateSpecialistQuestions,
    validateFinalGoal,
    submit,
  } = model;
  return (
    <section className="pf-dashboard-grid">
      <article className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>
              {flowStep === "ANAMNESIS"
                ? (questionnaire?.title ?? "Questionario")
                : "Definizione dell'obiettivo"}
            </h2>
            <p className="pf-muted">
              {flowStep === "ANAMNESIS"
                ? (questionnaire?.description ?? "Caricamento...")
                : "Ora usa l'anamnesi come contesto: l'obiettivo guidera le domande specialistiche e sara validato alla fine."}
            </p>
          </div>
          {questionnaire && (
            <StatusBadge tone={questionnaire.required ? "warning" : "success"}>
              {questionnaire.status}
            </StatusBadge>
          )}
        </div>

        <div className="pf-stack">
          {flowStep === "ANAMNESIS" && (
            <article className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>Sport</h3>
                  <p className="pf-muted">
                    Seleziona uno sport e una specializzazione tra quelle
                    configurate dall'amministratore.
                  </p>
                </div>
                {sportSelectionSaved && (
                  <StatusBadge tone="success">Salvato</StatusBadge>
                )}
              </div>
              <div className="pf-two-col">
                <label className="pf-field">
                  Sport
                  <select
                    className="pf-select"
                    value={selectedSportId}
                    onChange={(event) => {
                      const sportId = event.target.value;
                      const sport = sports.find((item) => item.id === sportId);
                      setSelectedSportId(sportId);
                      setSelectedSpecializationId(
                        sport?.specializations[0]?.id ?? "",
                      );
                      setSportSelectionSaved(false);
                      setGoalValidation(null);
                    }}
                  >
                    <option value="">Seleziona sport</option>
                    {sports.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {sport.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pf-field">
                  Specializzazione
                  <select
                    className="pf-select"
                    value={selectedSpecializationId}
                    disabled={!selectedSportId}
                    onChange={(event) => {
                      setSelectedSpecializationId(event.target.value);
                      setSportSelectionSaved(false);
                      setGoalValidation(null);
                    }}
                  >
                    <option value="">Seleziona specializzazione</option>
                    {specializationOptions.map((specialization) => (
                      <option key={specialization.id} value={specialization.id}>
                        {specialization.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="pf-actions">
                <button
                  className="pf-button-secondary"
                  type="button"
                  disabled={!sportSelectionValid}
                  onClick={saveSportSelection}
                >
                  Salva sport
                </button>
              </div>
            </article>
          )}

          {flowStep === "GOAL" && (
            <article className="pf-card">
              <div className="pf-card-top">
                <div>
                  <h3>Obiettivo</h3>
                  <p className="pf-muted">
                    Definisci l'obiettivo dopo aver completato l'anamnesi
                    generale.
                  </p>
                </div>
                {goalConfirmed && (
                  <StatusBadge tone="success">Pronto</StatusBadge>
                )}
              </div>
              {!goalIsValidated && (
                <textarea
                  className="pf-textarea"
                  rows={4}
                  value={goalText}
                  onChange={(event) => {
                    setGoalText(event.target.value);
                    setGoalValidation(null);
                    setGoalAssistantClosed(false);
                    setGoalRiskAcknowledged(false);
                    setFinalGoalValidated(false);
                    setPendingGoalRisk(null);
                  }}
                  placeholder="Esempio: voglio migliorare continuita, prevenire cali fisici e arrivare piu preparato alle gare."
                />
              )}
              {!goalIsValidated && (
                <div className="pf-actions">
                  <button
                    className="pf-button-secondary"
                    type="button"
                    disabled={
                      goalText.trim().length < 10 || !sportSelectionValid
                    }
                    onClick={confirmGoalContext}
                  >
                    Conferma obiettivo
                  </button>
                  {goalValidation && !goalValidation.canProceedToAnamnesis && (
                    <StatusBadge tone="warning">Non consono</StatusBadge>
                  )}
                </div>
              )}
              {goalConfirmed && !goalValidation && (
                <div className="pf-goal-validated-summary">
                  <div>
                    <span>Validazione finale</span>
                    <strong>
                      L'AI valutera realismo e coerenza dopo le risposte
                      anamnestiche.
                    </strong>
                  </div>
                </div>
              )}
              {goalValidation?.canProceedToAnamnesis && goalAssistantClosed && (
                <div className="pf-goal-validated-summary">
                  <div>
                    <span>Obiettivo validato</span>
                    <strong>{goalValidation.interpretedGoal}</strong>
                  </div>
                  <button
                    className="pf-button-secondary"
                    type="button"
                    onClick={() =>
                      openGoalConfirmation(
                        goalValidation,
                        refinedGoalDraft || goalText,
                      )
                    }
                  >
                    Aggiungi dettagli
                  </button>
                </div>
              )}
              {goalValidation?.canProceedToAnamnesis &&
                !goalAssistantClosed &&
                goalValidation?.interpretedGoal && (
                  <div className="pf-alert success">
                    <strong>Cosa ha capito l AI</strong>
                    <p>{goalValidation.interpretedGoal}</p>
                  </div>
                )}
              {goalValidation?.canProceedToAnamnesis &&
                !goalAssistantClosed &&
                goalValidation?.suggestedReformulatedGoal && (
                  <div className="pf-alert warning">
                    <strong>Proposta di riformulazione</strong>
                    <p>{goalValidation.suggestedReformulatedGoal}</p>
                  </div>
                )}
              {goalValidation?.canProceedToAnamnesis &&
              !goalAssistantClosed &&
              goalValidation?.questionsToUser?.length ? (
                <div className="pf-alert warning">
                  <strong>Domande utili</strong>
                  <ul>
                    {goalValidation.questionsToUser.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          )}

          {finalGoalValidated && missingRequiredAnswers > 0 && (
            <div className="pf-alert warning">
              <strong>Risposte mancanti</strong>
              <p>
                L'obiettivo risulta gia validato, ma mancano ancora{" "}
                {missingRequiredAnswers} risposte in questa sessione. Completa
                le domande visibili e poi valida di nuovo o crea la performance
                quando il pulsante si abilita.
              </p>
            </div>
          )}

          {showGoalValidationResult && goalValidation && (
            <article className="pf-card pf-next-step-card">
              <div className="pf-card-top">
                <div>
                  <p className="pf-eyebrow">Risposta AI</p>
                  <h3>
                    {goalValidation.status === "OK"
                      ? "Obiettivo validato"
                      : "Obiettivo da gestire con attenzione"}
                  </h3>
                </div>
                <StatusBadge
                  tone={goalValidation.status === "OK" ? "success" : "warning"}
                >
                  {goalValidation.status}
                </StatusBadge>
              </div>
              <div className="pf-goal-validated-summary">
                <div>
                  <span>Cosa ha capito l'AI</span>
                  <strong>{goalValidation.interpretedGoal}</strong>
                </div>
              </div>
              <p>{goalValidation.userMessage}</p>
              {goalValidation.suggestedReformulatedGoal && (
                <div className="pf-alert warning">
                  <strong>Riformulazione suggerita</strong>
                  <p>{goalValidation.suggestedReformulatedGoal}</p>
                </div>
              )}
              {goalValidation.nextStep && (
                <p className="pf-muted">{goalValidation.nextStep}</p>
              )}
            </article>
          )}

          {!validationLocksQuestionList &&
            visibleQuestions.map((question) => {
              const questionLocked =
                specialistQuestionsGenerated && question.scope === "GENERAL";
              return (
                <article key={question.id} className="pf-card">
                  <div className="pf-card-top">
                    <div>
                      {question.scope === "AREA" && (
                        <h3>{question.areaName}</h3>
                      )}
                      <p className="pf-muted">{question.text}</p>
                      {question.helpText && (
                        <p className="pf-muted">{question.helpText}</p>
                      )}
                    </div>
                    {answers[question.id] !== undefined &&
                      answers[question.id] !== "" && (
                        <StatusBadge tone="success">OK</StatusBadge>
                      )}
                  </div>
                  {question.inputType === "TEXT" && (
                    <textarea
                      className="pf-textarea"
                      value={String(answers[question.id] ?? "")}
                      readOnly={questionLocked}
                      onChange={(event) =>
                        questionLocked
                          ? undefined
                          : setQuestionAnswer(question.id, event.target.value)
                      }
                      rows={3}
                    />
                  )}
                  {question.inputType === "NUMBER" && (
                    <input
                      className="pf-input"
                      type="number"
                      value={String(answers[question.id] ?? "")}
                      readOnly={questionLocked}
                      onChange={(event) =>
                        questionLocked
                          ? undefined
                          : setQuestionAnswer(
                              question.id,
                              Number(event.target.value),
                            )
                      }
                    />
                  )}
                  {question.inputType === "SELECT" && (
                    <select
                      className="pf-select"
                      value={String(answers[question.id] ?? "")}
                      disabled={questionLocked}
                      onChange={(event) =>
                        setQuestionAnswer(question.id, event.target.value)
                      }
                    >
                      <option value="">Seleziona</option>
                      {question.options.map((option) => (
                        <option
                          key={String(option.value)}
                          value={String(option.value)}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {question.inputType === "SCORE" && (
                    <div className="pf-option-grid">
                      {(question.scope === "AREA"
                        ? specialistScoreOptions
                        : question.options.length
                          ? question.options
                          : (questionnaire?.options ?? [])
                      ).map((option) => (
                        <button
                          key={String(option.value)}
                          type="button"
                          className={
                            answers[question.id] === option.value
                              ? "pf-button"
                              : "pf-button-secondary"
                          }
                          disabled={questionLocked}
                          onClick={() =>
                            setQuestionAnswer(question.id, option.value)
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
        </div>

        {questionnaire &&
          flowStep === "GOAL" &&
          goalConfirmed &&
          !specialistQuestionsGenerated && (
            <div className="pf-submit-row">
              <article className="pf-card pf-next-step-card">
                <div className="pf-card-top">
                  <div>
                    <h3>Domande specialistiche AI</h3>
                    <p className="pf-muted">
                      Dopo l'anamnesi generale, l'AI genera tre domande per ogni
                      area per raccogliere dati utili a verificare anche il
                      realismo dell'obiettivo finale.
                    </p>
                  </div>
                  <StatusBadge tone={generalComplete ? "accent" : "warning"}>
                    {generalComplete ? "Pronte" : "Completa generale"}
                  </StatusBadge>
                </div>
                <button
                  className="pf-button"
                  type="button"
                  disabled={!generalComplete || generatingSpecialistQuestions}
                  onClick={generateSpecialistQuestions}
                >
                  {generatingSpecialistQuestions
                    ? "Generazione..."
                    : "Genera domande di realismo e area"}
                </button>
              </article>
            </div>
          )}

        {questionnaire &&
          flowStep === "GOAL" &&
          specialistQuestionsGenerated && (
            <div className="pf-submit-row">
              <article className="pf-card pf-next-step-card">
                <div className="pf-card-top">
                  <div>
                    <h3>Validazione finale obiettivo</h3>
                    <p className="pf-muted">
                      L'AI valuta l'obiettivo usando anamnesi e risposte
                      specialistiche. Se non risulta realistico devi prendere
                      visione prima della creazione finale.
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      finalGoalValidated
                        ? "success"
                        : completed
                          ? "accent"
                          : "warning"
                    }
                  >
                    {finalGoalValidated
                      ? goalRiskAcknowledged
                        ? "Presa visione"
                        : "Validato"
                      : completed
                        ? "Pronta"
                        : "Completa risposte"}
                  </StatusBadge>
                </div>
                <button
                  className="pf-button-secondary"
                  type="button"
                  disabled={
                    !completed || validatingFinalGoal || finalGoalValidated
                  }
                  onClick={() => void validateFinalGoal()}
                >
                  {validatingFinalGoal ? "Validazione..." : "Valida obiettivo"}
                </button>
              </article>
            </div>
          )}

        {questionnaire?.required === false ? (
          <button
            className="pf-button"
            type="button"
            onClick={() => {
              window.location.href = "/user";
            }}
          >
            Continua all'ambiente
          </button>
        ) : flowStep === "ANAMNESIS" ? (
          <div className="pf-submit-row">
            <button
              className="pf-button"
              type="button"
              disabled={!sportSelectionValid || !generalAnswersComplete}
              onClick={confirmAnamnesis}
            >
              Conferma
            </button>
          </div>
        ) : (
          <div className="pf-submit-row">
            <button
              className="pf-button"
              type="button"
              disabled={!canCreatePerformance || submitting}
              onClick={submit}
            >
              {redirecting
                ? "Apertura ambiente..."
                : submitting
                  ? "Salvataggio..."
                  : "Crea la performance"}
            </button>
          </div>
        )}
      </article>

      <aside className="pf-panel">
        <div className="pf-panel-header">
          <div>
            <h2>Anteprima baseline</h2>
            <p className="pf-muted">
              Il grafico spider appare dopo il salvataggio del questionario
              iniziale.
            </p>
          </div>
        </div>
        <RadarChart areas={radarAree} />
      </aside>
    </section>
  );
}
