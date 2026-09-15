"use client";

import { ProductShell } from "@/app/components/product-shell";
import Link from "next/link";
import { Suspense } from "react";
import { formatDate } from "./test-cases-model";
import { renderSimulationModal } from "./test-cases-simulation-modal";
import { renderSimulationQuestionInput } from "./test-cases-simulation-question-input";
import { renderTestHistory } from "./test-cases-test-history";
import { useTestCases } from "./use-test-cases";
export default function TestCasesPage() {
  return (
    <Suspense fallback={null}>
      <TestCasesContent />
    </Suspense>
  );
}
function TestCasesContent() {
  const model = useTestCases();
  const {
    router,
    audits,
    mode,
    running,
    message,
    setMessage,
    result,
    setResult,
    runSnapshot,
    setRunSnapshot,
    simulationOpen,
    anamnesisTestUsers,
    selectedAnamnesisUserId,
    anamnesisUserLabel,
    setAnamnesisUserLabel,
    usersEditorOpen,
    setUsersEditorOpen,
    currentMode,
    selectedCaseId,
    selectedGolden,
    sortedTestHistory,
    selectedGoldenAllHistory,
    activeGeneralQuestions,
    pageTitle,
    pageDescription,
    visiblePromptText,
    runStandardTest,
    applySavedAnamnesisUser,
    startNewAnamnesisTestUser,
    saveAnamnesisTestUser,
    deleteAnamnesisTestUser,
    openNewSimulation,
  } = model;
  return (
    <ProductShell
      eyebrow="GESTIONE AI"
      title={pageTitle}
      description={pageDescription}
    >
      <div className="pf-stack pf-test-cases" style={{ gap: 18 }}>
        {!mode && (
          <>
            <section className="pf-grid">
              <Link
                className="pf-card pf-test-case-card"
                href="/ai-tuner/test-cases?mode=standard"
              >
                <div className="pf-prompt-card-title">
                  <h3>Storico test</h3>
                </div>
                <p>Consulta i test eseguiti e avvia un nuovo caso test.</p>
              </Link>
              <Link
                className="pf-card pf-test-case-card"
                href="/ai-tuner/test-cases?mode=real"
              >
                <div className="pf-prompt-card-title">
                  <h3>Casi reali</h3>
                </div>
                <p>Consulta solo i casi reali generati dagli utenti.</p>
              </Link>
              <Link
                className="pf-card pf-test-case-card"
                href="/ai-tuner/test-cases?mode=users"
              >
                <div className="pf-prompt-card-title">
                  <h3>Utenti</h3>
                </div>
                <p>Configura profili anamnestici riutilizzabili nei test.</p>
              </Link>
            </section>

            {renderTestHistory(model, {
              title: "Storico test",
              description:
                "Tutti i test eseguiti sui casi standard. Clicca una riga per aprire il risultato.",
              emptyMessage: "Non ci sono ancora test eseguiti.",
              items: sortedTestHistory,
              showCase: true,
            })}
          </>
        )}

        {currentMode === "standard" && !selectedCaseId && (
          <section className="pf-panel pf-standard-cases-panel">
            <div className="pf-panel-header">
              <div>
                <h2>Storico test</h2>
                <p className="pf-muted">
                  Test prompt gia eseguiti. Clicca una riga per riaprire il
                  risultato.
                </p>
              </div>
              <div className="pf-actions pf-standard-cases-create">
                <button
                  className="pf-button"
                  type="button"
                  onClick={openNewSimulation}
                >
                  Nuovo caso test
                </button>
              </div>
            </div>

            {renderTestHistory(model, {
              title: "Test eseguiti",
              description:
                "Tutti i test prompt salvati nello storico locale di questa postazione.",
              emptyMessage: "Non ci sono ancora test eseguiti.",
              items: sortedTestHistory,
              showCase: true,
            })}
          </section>
        )}

        {currentMode === "standard" &&
          selectedCaseId &&
          result &&
          runSnapshot && (
            <section className="pf-panel pf-test-result-screen">
              <div className="pf-panel-header">
                <div>
                  <h2>Risultato test</h2>
                  <p className="pf-muted">
                    Caso standard: {runSnapshot.caseLabel}
                  </p>
                </div>
                <div className="pf-actions">
                  <button
                    type="button"
                    className="pf-button"
                    disabled={running}
                    onClick={() => runStandardTest({ keepCurrentResult: true })}
                  >
                    {running ? "Test in corso..." : "Riprova test"}
                  </button>
                  <button
                    type="button"
                    className="pf-button-secondary"
                    onClick={() => {
                      setResult(null);
                      setRunSnapshot(null);
                      setMessage(null);
                      router.replace(
                        `/ai-tuner/test-cases?mode=standard&caseId=${selectedCaseId}`,
                        { scroll: false },
                      );
                    }}
                  >
                    Modifica impostazioni
                  </button>
                </div>
              </div>

              {message && <div className="pf-alert warning">{message}</div>}

              <div className="pf-test-result-layout">
                <aside className="pf-panel pf-test-result-summary">
                  <h2>Riepilogo test</h2>
                  <div className="pf-prompt-info-card">
                    <div>
                      <span>Prompt</span>
                      <strong>{runSnapshot.promptName}</strong>
                    </div>
                    <div>
                      <span>Versione</span>
                      <strong>{runSnapshot.version}</strong>
                    </div>
                    <div>
                      <span>Provider richiesto</span>
                      <strong>{runSnapshot.provider}</strong>
                    </div>
                    <div>
                      <span>Area</span>
                      <strong>{runSnapshot.areaName ?? "Non indicata"}</strong>
                    </div>
                    <div>
                      <span>Livello atleta</span>
                      <strong>
                        {runSnapshot.athleteLevel ?? "Non indicato"}
                      </strong>
                    </div>
                    <div>
                      <span>Tempo risposta</span>
                      <strong>{result.latencyMs} ms</strong>
                    </div>
                  </div>
                </aside>

                <section className="pf-test-result-accordion">
                  <details className="pf-panel pf-test-result-disclosure" open>
                    <summary>
                      <span>Risposta AI</span>
                      <small>
                        {result.provider} / {result.model} - Token totali:{" "}
                        {result.totalTokens ?? "n/d"}
                      </small>
                    </summary>
                    <pre className="pf-readonly-code pf-ai-answer-output">
                      {result.outputText}
                    </pre>
                  </details>

                  <details className="pf-panel pf-test-result-disclosure">
                    <summary>
                      <span>Prompt usato per il test</span>
                      <small>Testo reale del prompt selezionato.</small>
                    </summary>
                    <pre className="pf-readonly-code">
                      {visiblePromptText()}
                    </pre>
                  </details>

                  <details className="pf-panel pf-test-result-disclosure">
                    <summary>
                      <span>Contesto del caso test</span>
                      <small>Dati del caso passati insieme al prompt.</small>
                    </summary>
                    <pre className="pf-readonly-code">
                      {runSnapshot.context}
                    </pre>
                  </details>
                </section>
              </div>
            </section>
          )}

        {currentMode === "standard" && selectedCaseId && !result && (
          <section className="pf-panel">
            <div className="pf-panel-header">
              <div>
                <h2>Test su caso standard</h2>
                <p className="pf-muted">
                  Configura il prompt da provare sul caso selezionato.
                </p>
              </div>
              <Link
                className="pf-button-secondary"
                href="/ai-tuner/test-cases?mode=standard"
              >
                Torna ai casi standard
              </Link>
            </div>

            {!selectedGolden ? (
              <div className="pf-alert warning">
                Caso test standard non trovato.
              </div>
            ) : (
              <div className="pf-stack">
                <Link
                  className="pf-card pf-standard-case-summary"
                  href={`/ai-tuner/golden-contexts?edit=${selectedGolden.id}&returnTo=${encodeURIComponent(
                    `/ai-tuner/test-cases?mode=standard&caseId=${selectedGolden.id}`,
                  )}`}
                >
                  <h3>{selectedGolden.label}</h3>
                  <p className="pf-muted">
                    {selectedGolden.area?.name ?? "Area non indicata"} -{" "}
                    {selectedGolden.athleteLevel ?? "livello non indicato"}
                  </p>
                  {selectedGolden.description && (
                    <p>{selectedGolden.description}</p>
                  )}
                </Link>

                <section className="pf-panel pf-start-test-panel">
                  <div className="pf-panel-header">
                    <div>
                      <h2>Avvia simulazione onboarding</h2>
                      <p className="pf-muted">
                        Parti dal caso selezionato, scegli o compila l'utente
                        test e segui il flusso operativo reale.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="pf-button"
                      disabled={running}
                      onClick={openNewSimulation}
                    >
                      Inizia test
                    </button>
                  </div>
                  {message && <div className="pf-alert warning">{message}</div>}
                </section>

                {renderTestHistory(model, {
                  title: "Storico test eseguiti",
                  description:
                    "Test eseguiti con questo caso. Clicca una riga per riaprire il risultato.",
                  emptyMessage:
                    "Non ci sono ancora test eseguiti con questo caso.",
                  items: selectedGoldenAllHistory,
                })}
              </div>
            )}
          </section>
        )}

        {currentMode === "users" && (
          <section className="pf-panel pf-test-users-panel">
            <div className="pf-panel-header">
              <div>
                <h2>Utenti test</h2>
                <p className="pf-muted">
                  Profili anamnestici salvati per precompilare il flusso
                  onboarding nei test prompt.
                </p>
              </div>
              <button
                className="pf-button"
                type="button"
                onClick={startNewAnamnesisTestUser}
              >
                Nuovo utente
              </button>
            </div>

            {message && <div className="pf-alert warning">{message}</div>}

            <div className="pf-test-users-layout">
              <section className="pf-panel">
                <div className="pf-panel-header">
                  <div>
                    <h2>Archivio utenti</h2>
                    <p className="pf-muted">
                      Profili anamnestici salvati. Apri una scheda per
                      consultarla o modificarla.
                    </p>
                  </div>
                </div>
                {anamnesisTestUsers.length === 0 ? (
                  <div className="pf-alert warning">
                    Non ci sono ancora utenti anamnestici salvati.
                  </div>
                ) : (
                  <div className="pf-test-users-list">
                    {anamnesisTestUsers.map((user) => (
                      <article
                        className="pf-card pf-test-user-card"
                        key={user.id}
                      >
                        <div>
                          <h3>{user.label}</h3>
                          <p className="pf-muted">
                            {Object.keys(user.answers).length} risposte
                            anamnestiche - Aggiornato{" "}
                            {formatDate(user.updatedAt)}
                          </p>
                        </div>
                        <div className="pf-test-user-actions">
                          <button
                            className="pf-button-secondary"
                            type="button"
                            onClick={() => applySavedAnamnesisUser(user.id)}
                          >
                            Apri scheda
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {usersEditorOpen && (
                <section className="pf-panel">
                  <div className="pf-panel-header">
                    <div>
                      <h2>
                        {selectedAnamnesisUserId
                          ? "Modifica utente"
                          : "Nuovo utente"}
                      </h2>
                      <p className="pf-muted">
                        Qui salvi solo dati anamnestici, non sport,
                        specializzazione o JSON completo del caso test.
                      </p>
                    </div>
                  </div>

                  <div className="pf-stack">
                    <label className="pf-field">
                      Nome utente test
                      <input
                        className="pf-input"
                        value={anamnesisUserLabel}
                        onChange={(event) =>
                          setAnamnesisUserLabel(event.target.value)
                        }
                        placeholder="Es. Anamnesi runner principiante"
                      />
                    </label>

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

                    <div className="pf-form-actions">
                      <button
                        className="pf-button"
                        type="button"
                        onClick={saveAnamnesisTestUser}
                      >
                        Salva utente
                      </button>
                      {selectedAnamnesisUserId && (
                        <button
                          className="pf-button-danger"
                          type="button"
                          onClick={deleteAnamnesisTestUser}
                        >
                          Elimina utente
                        </button>
                      )}
                      <button
                        className="pf-button-secondary"
                        type="button"
                        onClick={() => setUsersEditorOpen(false)}
                      >
                        Chiudi scheda
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </section>
        )}

        {currentMode === "real" && (
          <section className="pf-panel">
            <div className="pf-panel-header">
              <div>
                <h2>Casi reali</h2>
                <p className="pf-muted">
                  Generazioni AI prodotte dagli utenti reali della piattaforma.
                </p>
              </div>
            </div>

            {audits.length === 0 ? (
              <div className="pf-alert warning">
                Non ci sono ancora casi reali recenti.
              </div>
            ) : (
              <div className="pf-card">
                <table className="pf-table">
                  <thead>
                    <tr>
                      <th>Atleta</th>
                      <th>Area</th>
                      <th>Provider / modello</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audits.map((item) => (
                      <tr key={item.id}>
                        <td>{item.athleteLabel}</td>
                        <td>{item.area?.name ?? "senza area"}</td>
                        <td>
                          {item.provider}
                          {item.model ? ` / ${item.model}` : ""}
                        </td>
                        <td>{formatDate(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {simulationOpen && renderSimulationModal(model)}
      </div>
    </ProductShell>
  );
}
