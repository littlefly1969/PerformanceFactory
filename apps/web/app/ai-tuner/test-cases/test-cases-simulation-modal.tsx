"use client";

import {
  ProviderChoice,
  promptOptions,
  simulationPhases,
  specialistScoreOptions,
} from "./test-cases-model";
import { renderSimulationQuestionInput } from "./test-cases-simulation-question-input";
import type { TestCasesModel } from "./use-test-cases";
export function renderSimulationModal(model: TestCasesModel) {
  const {
    version,
    setVersion,
    provider,
    setProvider,
    running,
    message,
    setSimulationOpen,
    simulationPhase,
    setSimulationPhase,
    simulationPromptName,
    setSimulationPromptName,
    simulationGoal,
    setSimulationGoal,
    setSimulationSportId,
    setSimulationSpecializationId,
    anamnesisTestUsers,
    selectedAnamnesisUserId,
    anamnesisUserLabel,
    setSimulationGoalPromptId,
    simulationAiQuestionsResult,
    simulationSpecialistScores,
    setSimulationSpecialistScores,
    simulationTestResult,
    setSimulationTestResult,
    simulationTestSnapshot,
    setSimulationTestSnapshot,
    simulationDialogOpen,
    setSimulationDialogOpen,
    simulationChatMessages,
    simulationChatInput,
    setSimulationChatInput,
    refiningSimulationDialog,
    activeGeneralQuestions,
    activeSports,
    goalPromptConfigs,
    selectedSimulationGoalPrompt,
    selectedSimulationSport,
    activeSimulationSpecializations,
    selectedSimulationSpecialization,
    resolvePromptText,
    applySavedAnamnesisUser,
    simulationSpecialistQuestions,
    continueSimulationDialog,
    goToNextSimulationStep,
  } = model;

  const currentPhase =
    simulationPhases.find((item) => item.id === simulationPhase) ??
    simulationPhases[0];
  const currentPromptText =
    simulationPhase === "area-proposal"
      ? simulationPromptName === "Validazione obiettivo"
        ? (selectedSimulationGoalPrompt?.basePrompt?.trim() ?? null)
        : resolvePromptText(simulationPromptName)
      : currentPhase.promptName
        ? resolvePromptText(currentPhase.promptName)
        : null;
  const nextLabel =
    simulationPhase === "prompt-choice"
      ? "Avanti"
      : simulationPhase === "anamnesis"
        ? "Avanti"
        : simulationPhase === "goal"
          ? running
            ? "Generazione..."
            : "Avanti"
          : simulationPhase === "area-questions"
            ? "Avanti"
            : simulationPhase === "area-proposal"
              ? running
                ? "Test in corso..."
                : "Testa prompt obiettivo"
              : "Avanti";

  return (
    <>
      <div className="pf-modal-backdrop" role="dialog" aria-modal="true">
        <section className="pf-modal pf-onboarding-test-modal">
          <div className="pf-panel-header">
            <div>
              <h2>Simulazione onboarding</h2>
              <p className="pf-muted">
                Compila i dati come farebbe un utente e testa i prompt nelle
                varie fasi.
              </p>
            </div>
            <button
              className="pf-button-secondary"
              type="button"
              onClick={() => {
                setSimulationDialogOpen(false);
                setSimulationOpen(false);
              }}
            >
              Chiudi
            </button>
          </div>

          <div className="pf-onboarding-test-layout">
            <aside className="pf-onboarding-phase-list">
              {simulationPhases.slice(0, 5).map((phase) => (
                <button
                  className={`pf-onboarding-phase-button ${
                    phase.id === simulationPhase ? "active" : ""
                  }`}
                  key={phase.id}
                  type="button"
                  onClick={() => setSimulationPhase(phase.id)}
                >
                  <span>{phase.title}</span>
                  <small>{phase.promptName ?? "Raccolta dati"}</small>
                </button>
              ))}
            </aside>

            <div className="pf-onboarding-test-content">
              <section className="pf-panel">
                <div className="pf-panel-header">
                  <div>
                    <h2>{currentPhase.title}</h2>
                    <p className="pf-muted">{currentPhase.description}</p>
                  </div>
                </div>

                {simulationPhase === "prompt-choice" && (
                  <div className="pf-stack">
                    <label className="pf-field">
                      Prompt da testare
                      <select
                        className="pf-select"
                        value={simulationPromptName}
                        onChange={(event) =>
                          setSimulationPromptName(event.target.value)
                        }
                      >
                        {promptOptions.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <div className="pf-prompt-info-card">
                      <div>
                        <span>Flusso avviato</span>
                        <strong>
                          {simulationPromptName === "Validazione obiettivo"
                            ? "Anamnesi o utente test, poi obiettivo"
                            : "Contesto utente, poi prompt selezionato"}
                        </strong>
                      </div>
                      <div>
                        <span>Utenti anamnestici</span>
                        <strong>{anamnesisTestUsers.length}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {simulationPhase === "anamnesis" && (
                  <div className="pf-stack">
                    <label className="pf-field">
                      Utente test salvato
                      <select
                        className="pf-select"
                        value={selectedAnamnesisUserId}
                        onChange={(event) =>
                          applySavedAnamnesisUser(event.target.value)
                        }
                      >
                        <option value="">Compilazione manuale</option>
                        {anamnesisTestUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="pf-onboarding-sim-grid">
                      <label className="pf-field">
                        Sport
                        <select
                          className="pf-select"
                          value={selectedSimulationSport?.id ?? ""}
                          onChange={(event) => {
                            setSimulationSportId(event.target.value);
                            setSimulationSpecializationId("");
                          }}
                        >
                          {activeSports.map((sport) => (
                            <option
                              key={sport.id ?? sport.label}
                              value={sport.id ?? ""}
                            >
                              {sport.label ?? "Sport"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="pf-field">
                        Specializzazione
                        <select
                          className="pf-select"
                          value={selectedSimulationSpecialization?.id ?? ""}
                          onChange={(event) =>
                            setSimulationSpecializationId(event.target.value)
                          }
                        >
                          {activeSimulationSpecializations.map(
                            (specialization) => (
                              <option
                                key={specialization.id ?? specialization.label}
                                value={specialization.id ?? ""}
                              >
                                {specialization.label ?? "Specializzazione"}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>

                    {activeGeneralQuestions.length === 0 ? (
                      <div className="pf-alert warning">
                        Nessuna domanda anamnesi attiva. Configurale nella
                        sezione Anamnesi.
                      </div>
                    ) : (
                      <div className="pf-onboarding-question-list">
                        {activeGeneralQuestions.map((question) => (
                          <label className="pf-field" key={question.id}>
                            {question.label}
                            {question.helpText && (
                              <span className="pf-field-hint">
                                {question.helpText}
                              </span>
                            )}
                            {renderSimulationQuestionInput(model, question)}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {simulationPhase === "goal" && (
                  <div className="pf-stack">
                    <label className="pf-field">
                      Obiettivo scritto dall'utente
                      <textarea
                        className="pf-textarea"
                        rows={5}
                        value={simulationGoal}
                        onChange={(event) =>
                          setSimulationGoal(event.target.value)
                        }
                        placeholder="Esempio: Voglio preparare una mezza maratona tra 4 mesi..."
                      />
                    </label>

                    <div className="pf-prompt-info-card">
                      <div>
                        <span>Sport</span>
                        <strong>{selectedSimulationSport?.label ?? "-"}</strong>
                      </div>
                      <div>
                        <span>Specializzazione</span>
                        <strong>
                          {selectedSimulationSpecialization?.label ?? "-"}
                        </strong>
                      </div>
                      <div>
                        <span>Anamnesi</span>
                        <strong>
                          {activeGeneralQuestions.length} domande configurate
                        </strong>
                      </div>
                      <div>
                        <span>Utente anamnestico</span>
                        <strong>
                          {anamnesisUserLabel.trim() || "Manuale"}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {simulationPhase === "area-questions" && (
                  <div className="pf-stack">
                    {!simulationAiQuestionsResult ? (
                      <div className="pf-alert warning">
                        Premi Avanti dallo step Obiettivo per generare le
                        domande AI.
                      </div>
                    ) : simulationSpecialistQuestions.length === 0 ? (
                      <details
                        className="pf-panel pf-test-result-disclosure"
                        open
                      >
                        <summary>
                          <span>Domande proposte dall'AI</span>
                          <small>
                            {simulationAiQuestionsResult.provider} /{" "}
                            {simulationAiQuestionsResult.model}
                          </small>
                        </summary>
                        <pre className="pf-readonly-code">
                          {simulationAiQuestionsResult.outputText}
                        </pre>
                      </details>
                    ) : (
                      <div className="pf-onboarding-question-list">
                        {simulationSpecialistQuestions.map((question) => (
                          <article
                            className="pf-card pf-simulation-question-card"
                            key={question.id}
                          >
                            <div className="pf-card-top">
                              <div>
                                {question.area && <h3>{question.area}</h3>}
                                <p className="pf-muted">{question.text}</p>
                              </div>
                              {simulationSpecialistScores[question.id] !==
                                undefined && (
                                <span className="pf-badge success">OK</span>
                              )}
                            </div>
                            <div className="pf-option-grid">
                              {specialistScoreOptions.map((score) => (
                                <button
                                  className={
                                    simulationSpecialistScores[question.id] ===
                                    score
                                      ? "pf-button"
                                      : "pf-button-secondary"
                                  }
                                  key={score}
                                  type="button"
                                  onClick={() =>
                                    setSimulationSpecialistScores(
                                      (current) => ({
                                        ...current,
                                        [question.id]: score,
                                      }),
                                    )
                                  }
                                >
                                  {score}
                                </button>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {simulationPhase === "area-proposal" && (
                  <div className="pf-stack">
                    <div className="pf-onboarding-sim-grid">
                      {simulationPromptName === "Validazione obiettivo" ? (
                        <label className="pf-field">
                          Prompt obiettivo da usare
                          <select
                            className="pf-select"
                            value={selectedSimulationGoalPrompt?.id ?? ""}
                            onChange={(event) => {
                              setSimulationGoalPromptId(event.target.value);
                              setSimulationTestResult(null);
                              setSimulationTestSnapshot(null);
                            }}
                          >
                            {goalPromptConfigs.map((config, index) => (
                              <option
                                key={config.id ?? `goal-${index}`}
                                value={config.id ?? ""}
                              >
                                {config.name ?? "Prompt obiettivo"}{" "}
                                {config.version ? `v${config.version}` : ""}
                                {config.isActive ? " - attivo" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div className="pf-field">
                          Prompt da testare
                          <div className="pf-readonly-field">
                            {simulationPromptName}
                          </div>
                        </div>
                      )}
                      <label className="pf-field">
                        Provider AI
                        <select
                          className="pf-select"
                          value={provider}
                          onChange={(event) => {
                            setProvider(event.target.value as ProviderChoice);
                            setSimulationTestResult(null);
                            setSimulationTestSnapshot(null);
                          }}
                        >
                          <option value="configured">
                            Provider configurato
                          </option>
                          <option value="stub">Stub</option>
                          <option value="gemini">Gemini</option>
                          <option value="openai">OpenAI</option>
                        </select>
                      </label>
                    </div>
                    <label className="pf-field">
                      Versione prompt
                      <select
                        className="pf-select"
                        value={version}
                        onChange={(event) => {
                          setVersion(event.target.value);
                          setSimulationTestResult(null);
                          setSimulationTestSnapshot(null);
                        }}
                      >
                        <option>Versione attiva</option>
                        <option>Bozza corrente</option>
                        <option>Versione precedente</option>
                        <option>Versione duplicata / sperimentale</option>
                      </select>
                    </label>
                    {currentPromptText ? (
                      <details
                        className="pf-panel pf-test-result-disclosure"
                        open
                      >
                        <summary>
                          <span>Prompt selezionato</span>
                          <small>Testo reale che verra testato.</small>
                        </summary>
                        <pre className="pf-readonly-code">
                          {currentPromptText}
                        </pre>
                      </details>
                    ) : (
                      <div className="pf-alert warning">
                        Nessun prompt disponibile.
                      </div>
                    )}
                    {simulationTestResult && simulationTestSnapshot && (
                      <article className="pf-panel pf-simulation-ai-output">
                        <div className="pf-panel-header">
                          <div>
                            <h2>Risposta AI</h2>
                            <p className="pf-muted">
                              Output generato con i dati della simulazione
                              onboarding.
                            </p>
                          </div>
                          <div className="pf-form-actions">
                            <span className="pf-badge success">
                              {simulationTestResult.provider} /{" "}
                              {simulationTestResult.model}
                            </span>
                            <button
                              className="pf-button-secondary"
                              type="button"
                              onClick={() => setSimulationDialogOpen(true)}
                            >
                              Apri dialogo
                            </button>
                          </div>
                        </div>
                        <pre className="pf-readonly-code">
                          {simulationTestResult.outputText}
                        </pre>
                      </article>
                    )}
                  </div>
                )}
                {message && <div className="pf-alert warning">{message}</div>}
                <div className="pf-form-actions">
                  <button
                    className="pf-button"
                    type="button"
                    disabled={running}
                    onClick={() => goToNextSimulationStep()}
                  >
                    {nextLabel}
                  </button>
                  {simulationPhase !== "prompt-choice" && (
                    <button
                      className="pf-button-secondary"
                      type="button"
                      disabled={running}
                      onClick={() =>
                        setSimulationPhase(
                          simulationPhase === "area-proposal"
                            ? "area-questions"
                            : simulationPhase === "area-questions"
                              ? "goal"
                              : simulationPhase === "goal"
                                ? simulationPromptName ===
                                  "Validazione obiettivo"
                                  ? "anamnesis"
                                  : "prompt-choice"
                                : "prompt-choice",
                        )
                      }
                    >
                      Indietro
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
      {simulationDialogOpen && simulationTestSnapshot && (
        <div
          className="pf-modal-backdrop pf-simulation-dialog-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <section className="pf-modal pf-goal-modal pf-simulation-dialog-modal">
            <div className="pf-panel-header">
              <div>
                <p className="pf-eyebrow">Dialogo utente simulato</p>
                <h2>Risposta AI</h2>
                <p className="pf-muted">
                  Continua la conversazione come farebbe l'utente se l'AI
                  richiede dettagli aggiuntivi.
                </p>
              </div>
              <button
                className="pf-button-secondary"
                type="button"
                onClick={() => setSimulationDialogOpen(false)}
              >
                Chiudi
              </button>
            </div>

            <div className="pf-goal-draft">
              <span>Obiettivo</span>
              <strong>{simulationGoal}</strong>
            </div>

            <div className="pf-goal-chat">
              {simulationChatMessages.map((item, index) => (
                <div
                  className={`pf-goal-message ${item.role}`}
                  key={`${item.role}-${index}`}
                >
                  <span>{item.role === "assistant" ? "AI" : "Tu"}</span>
                  <p>{item.content}</p>
                </div>
              ))}
            </div>

            <label className="pf-field">
              Aggiungi dettagli o rispondi all'AI
              <textarea
                className="pf-textarea"
                rows={3}
                value={simulationChatInput}
                onChange={(event) => setSimulationChatInput(event.target.value)}
                placeholder="Scrivi come farebbe l'utente, senza riscrivere tutto l'obiettivo."
              />
            </label>

            <div className="pf-actions">
              <button
                className="pf-button-secondary"
                type="button"
                disabled={
                  refiningSimulationDialog || !simulationChatInput.trim()
                }
                onClick={() => void continueSimulationDialog()}
              >
                {refiningSimulationDialog ? "Analisi..." : "Invia risposta"}
              </button>
              <button
                className="pf-button"
                type="button"
                onClick={() => setSimulationDialogOpen(false)}
              >
                Conferma e chiudi
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
