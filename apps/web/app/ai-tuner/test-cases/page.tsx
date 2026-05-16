"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ProductShell } from "@/app/components/product-shell";
import { API_BASE, secureFetch } from "@/app/lib/api";

type CaseMode = "standard" | "real";
type ProviderChoice = "configured" | "stub" | "openai" | "gemini";
type Area = { id: string; name: string };
type Golden = {
  id: string;
  label: string;
  description?: string | null;
  athleteLevel?: string | null;
  area?: Area;
  contextJson?: unknown;
};
type GoalPromptConfig = {
  basePrompt: string;
};
type AreaGenerationConfig = {
  areaId: string;
  initialContext: string;
  responseFormatPrompt: string;
  questionnaireLayoutJson: unknown;
};
type SportPrompt = {
  areaId: string;
  basePrompt: string;
  isEnabledDriver: boolean;
  isActive: boolean;
};
type SportSpecialization = {
  trainingPrompt?: string | null;
  trainingPromptActive: boolean;
  isActive: boolean;
  prompts: SportPrompt[];
};
type SportCatalogItem = {
  isActive: boolean;
  specializations: SportSpecialization[];
};
type PromptSettings = {
  goalPromptConfig?: GoalPromptConfig | null;
  areaGenerationConfigs: AreaGenerationConfig[];
  sports: SportCatalogItem[];
};
type AuditRow = {
  id: string;
  athleteLabel: string;
  createdAt: string;
  provider: string;
  model?: string;
  area: Area | null;
};
type TestResult = {
  provider: string;
  model: string;
  outputText: string;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};
type TestRunSnapshot = {
  promptName: string;
  promptText: string;
  version: string;
  provider: ProviderChoice;
  caseLabel: string;
  areaName: string | null;
  athleteLevel: string | null;
  context: string;
};
type TestRunHistoryItem = {
  id: string;
  goldenId: string;
  createdAt: string;
  snapshot: TestRunSnapshot;
  result: TestResult;
};

const promptOptions = [
  "Validazione obiettivo",
  "Configurazione aree performance",
  "Generazione proposta area",
  "Allenamento specifico",
];
const standardCasesPath = "/ai-tuner/test-cases?mode=standard";
const standardCasesReturn = encodeURIComponent(standardCasesPath);
const testHistoryStorageKey = "pf-ai-tuner-standard-test-history-v1";

const readError = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data.message ?? data.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const abbreviateTitle = (value: string, maxLength = 46) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;

export default function TestCasesPage() {
  return (
    <Suspense fallback={null}>
      <TestCasesContent />
    </Suspense>
  );
}

function TestCasesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [goldens, setGoldens] = useState<Golden[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [promptSettings, setPromptSettings] = useState<PromptSettings | null>(
    null,
  );
  const [mode, setMode] = useState<CaseMode | null>(null);
  const [prompt, setPrompt] = useState(promptOptions[0]);
  const [version, setVersion] = useState("Versione attiva");
  const [provider, setProvider] = useState<ProviderChoice>("configured");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [runSnapshot, setRunSnapshot] = useState<TestRunSnapshot | null>(null);
  const [testHistory, setTestHistory] = useState<TestRunHistoryItem[]>([]);
  const queryModeParam = searchParams.get("mode");
  const currentMode: CaseMode | null =
    queryModeParam === "standard" || queryModeParam === "real"
      ? queryModeParam
      : mode;
  const selectedCaseId =
    currentMode === "standard" ? searchParams.get("caseId") ?? "" : "";
  const activeHistoryId =
    currentMode === "standard" ? searchParams.get("historyId") ?? "" : "";

  useEffect(() => {
    const queryMode = searchParams.get("mode");
    const queryHistoryId = searchParams.get("historyId") ?? "";
    if (queryMode === "standard" || queryMode === "real") {
      setMode(queryMode);
      if (queryMode !== "standard" || !queryHistoryId) {
        setResult(null);
        setRunSnapshot(null);
      }
      setMessage(null);
      return;
    }
    setMode(null);
    setResult(null);
    setRunSnapshot(null);
    setMessage(null);
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      const [goldensRes, auditsRes, promptSettingsRes] = await Promise.all([
        secureFetch(`${API_BASE}/ai-tuning/golden-contexts`),
        secureFetch(`${API_BASE}/ai-tuning/audits?page=1`),
        secureFetch(`${API_BASE}/ai-tuning/prompt-settings`),
      ]);
      if (goldensRes.ok) {
        const data = (await goldensRes.json()) as Golden[];
        setGoldens(data);
      }
      if (auditsRes.ok) {
        const data = (await auditsRes.json()) as { items: AuditRow[] };
        setAudits(data.items);
      }
      if (promptSettingsRes.ok) {
        setPromptSettings((await promptSettingsRes.json()) as PromptSettings);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(testHistoryStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as TestRunHistoryItem[];
      if (Array.isArray(parsed)) {
        setTestHistory(parsed);
      }
    } catch {
      setTestHistory([]);
    }
  }, []);

  const selectedGolden = useMemo(
    () => goldens.find((item) => item.id === selectedCaseId) ?? null,
    [goldens, selectedCaseId],
  );
  const sortedTestHistory = useMemo(
    () =>
      [...testHistory].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [testHistory],
  );
  const selectedGoldenHistory = useMemo(
    () =>
      sortedTestHistory.filter(
        (item) =>
          item.goldenId === selectedCaseId &&
          item.snapshot.promptName === prompt &&
          item.snapshot.version === version &&
          item.snapshot.provider === provider,
      ),
    [prompt, provider, selectedCaseId, sortedTestHistory, version],
  );
  const pageTitle = selectedCaseId
    ? selectedGolden
      ? abbreviateTitle(selectedGolden.label)
      : "Caso test standard"
    : currentMode === "standard"
      ? "Casi test standard"
      : currentMode === "real"
        ? "Casi reali"
        : "Test su casi";
  const pageDescription = selectedCaseId
    ? "Configura ed esegui test su questo caso standard."
    : "Prova i prompt su profili standard o su risposte reali gia generate dal sistema.";

  useEffect(() => {
    if (!activeHistoryId || currentMode !== "standard") return;
    const historyItem = testHistory.find((item) => item.id === activeHistoryId);
    if (!historyItem) return;
    setPrompt(historyItem.snapshot.promptName);
    setVersion(historyItem.snapshot.version);
    setProvider(historyItem.snapshot.provider);
    setRunSnapshot(historyItem.snapshot);
    setResult(historyItem.result);
    setMessage(null);
  }, [activeHistoryId, currentMode, testHistory]);

  const saveHistoryItem = (item: TestRunHistoryItem) => {
    setTestHistory((current) => {
      const next = [item, ...current].slice(0, 80);
      window.localStorage.setItem(testHistoryStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const removeHistoryItem = (id: string) => {
    if (!window.confirm("Rimuovere questo test dallo storico?")) return;
    setTestHistory((current) => {
      const next = current.filter((item) => item.id !== id);
      window.localStorage.setItem(testHistoryStorageKey, JSON.stringify(next));
      return next;
    });
    if (activeHistoryId === id) {
      setResult(null);
      setRunSnapshot(null);
      router.replace(
        selectedCaseId
          ? `/ai-tuner/test-cases?mode=standard&caseId=${selectedCaseId}`
          : "/ai-tuner/test-cases",
        { scroll: false },
      );
    }
  };

  const openHistoryResult = (item: TestRunHistoryItem) => {
    setPrompt(item.snapshot.promptName);
    setVersion(item.snapshot.version);
    setProvider(item.snapshot.provider);
    setRunSnapshot(item.snapshot);
    setResult(item.result);
    setMessage(null);
    router.replace(
      `/ai-tuner/test-cases?mode=standard&caseId=${item.goldenId}&historyId=${item.id}`,
      { scroll: false },
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resolvePromptText = (promptName = prompt) => {
    if (!promptSettings) {
      return null;
    }
    if (promptName === "Validazione obiettivo") {
      return promptSettings.goalPromptConfig?.basePrompt?.trim() || null;
    }

    if (promptName === "Generazione proposta area") {
      const areaConfig = promptSettings.areaGenerationConfigs.find(
        (item) => item.areaId === selectedGolden?.area?.id,
      );
      if (!areaConfig) {
        return null;
      }
      return [
        "[Istruzioni di generazione]",
        areaConfig.initialContext,
        "",
        "[Formato della proposta]",
        areaConfig.responseFormatPrompt,
        "",
        "[Questionario di monitoraggio]",
        JSON.stringify(areaConfig.questionnaireLayoutJson ?? {}, null, 2),
      ].join("\n");
    }

    const activeSpecializations =
      promptSettings.sports
        .filter((sport) => sport.isActive)
        .flatMap((sport) =>
          sport.specializations.filter(
            (specialization) => specialization.isActive,
          ),
        ) ?? [];

    if (promptName === "Configurazione aree performance") {
      const sportPrompt = activeSpecializations
        .flatMap((specialization) => specialization.prompts)
        .find(
          (item) =>
            item.areaId === selectedGolden?.area?.id &&
            item.isActive &&
            item.isEnabledDriver,
        );
      return sportPrompt?.basePrompt?.trim() || null;
    }

    const trainingPrompt = activeSpecializations.find(
      (specialization) =>
        specialization.trainingPromptActive && specialization.trainingPrompt,
    )?.trainingPrompt;
    return trainingPrompt?.trim() || null;
  };

  const promptLooksLikeCaseDescription = (text: string) => {
    const normalizedPrompt = text.trim();
    const normalizedDescription = selectedGolden?.description?.trim();
    if (!normalizedPrompt || !normalizedDescription) return false;
    return normalizedPrompt === normalizedDescription;
  };

  const visiblePromptText = () => {
    if (!runSnapshot) return "";
    const storedPrompt = runSnapshot.promptText.trim();
    if (
      storedPrompt &&
      !storedPrompt.startsWith("Prompt da testare:") &&
      !promptLooksLikeCaseDescription(storedPrompt)
    ) {
      return storedPrompt;
    }
    return (
      resolvePromptText(runSnapshot.promptName) ??
      "Prompt reale non disponibile per questo risultato storico."
    );
  };

  const runStandardTest = async (
    options: { keepCurrentResult?: boolean } = {},
  ) => {
    if (!selectedGolden) {
      setMessage("Prima crea o seleziona un caso test standard.");
      return;
    }
    const context = JSON.stringify(
      {
        tipoCaso: "Caso test standard",
        caso: selectedGolden.label,
        area: selectedGolden.area?.name ?? null,
        livelloAtleta: selectedGolden.athleteLevel ?? null,
        datiSinteticiAtleta: selectedGolden.contextJson ?? {},
        versionePrompt: version,
      },
      null,
      2,
    );
    const promptText = resolvePromptText();
    if (!promptText || promptLooksLikeCaseDescription(promptText)) {
      setMessage(
        "Prompt reale non disponibile: controlla che il prompt selezionato sia configurato e attivo prima di eseguire il test.",
      );
      return;
    }
    setRunning(true);
    setMessage(null);
    if (!options.keepCurrentResult) {
      setResult(null);
      setRunSnapshot(null);
    }
    const snapshot: TestRunSnapshot = {
      promptName: prompt,
      promptText,
      version,
      provider,
      caseLabel: selectedGolden.label,
      areaName: selectedGolden.area?.name ?? null,
      athleteLevel: selectedGolden.athleteLevel ?? null,
      context,
    };

    const response = await secureFetch(`${API_BASE}/ai-tuning/prompt-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        prompt: promptText,
        context,
      }),
    });
    setRunning(false);

    if (!response.ok) {
      setMessage(`Test non riuscito: ${await readError(response)}`);
      return;
    }
    const nextResult = (await response.json()) as TestResult;
    setRunSnapshot(snapshot);
    setResult(nextResult);
    saveHistoryItem({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      goldenId: selectedGolden.id,
      createdAt: new Date().toISOString(),
      snapshot,
      result: nextResult,
    });
  };

  const renderTestHistory = ({
    title,
    description,
    emptyMessage,
    items,
    showCase,
  }: {
    title: string;
    description: string;
    emptyMessage: string;
    items: TestRunHistoryItem[];
    showCase?: boolean;
  }) => (
    <section className="pf-panel pf-test-history-panel">
      <div className="pf-panel-header">
        <div>
          <h2>{title}</h2>
          <p className="pf-muted">{description}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="pf-alert warning">{emptyMessage}</div>
      ) : (
        <div className="pf-card pf-test-history-table-wrap">
          <table className="pf-table pf-test-history-table">
            <thead>
              <tr>
                <th>Data</th>
                {showCase && <th>Caso</th>}
                <th>Prompt</th>
                <th>Versione</th>
                <th>Provider / modello</th>
                <th>Tempo</th>
                <th>Token</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="pf-clickable-table-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => openHistoryResult(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openHistoryResult(item);
                    }
                  }}
                >
                  <td>{formatDate(item.createdAt)}</td>
                  {showCase && <td>{item.snapshot.caseLabel}</td>}
                  <td>{item.snapshot.promptName}</td>
                  <td>{item.snapshot.version}</td>
                  <td>
                    {item.result.provider} / {item.result.model}
                  </td>
                  <td>{item.result.latencyMs} ms</td>
                  <td>{item.result.totalTokens ?? "n/d"}</td>
                  <td>
                    <button
                      type="button"
                      className="pf-button-secondary pf-history-remove-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeHistoryItem(item.id);
                      }}
                    >
                      Rimuovi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

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
                  <h3>Casi test standard</h3>
                </div>
                <p>Apri lo storico dei casi standard creati.</p>
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
            </section>

            {renderTestHistory({
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
                <h2>Casi test standard</h2>
                <p className="pf-muted">
                  Storico dei casi standard creati per test ripetibili.
                </p>
              </div>
              <div className="pf-actions pf-standard-cases-create">
                <Link
                  className="pf-button"
                  href={`/ai-tuner/golden-contexts?create=1&returnTo=${standardCasesReturn}`}
                >
                  Nuovo caso test
                </Link>
              </div>
            </div>

            {goldens.length === 0 ? (
              <div className="pf-alert warning">
                Non ci sono ancora casi test standard. Creane uno prima di
                eseguire il test.
              </div>
            ) : (
              <div className="pf-standard-cases-list">
                {goldens.map((item) => (
                  <article className="pf-card pf-standard-case-block" key={item.id}>
                    <div className="pf-standard-case-content">
                      <div className="pf-standard-case-field">
                        <span className="pf-standard-case-label">Caso test</span>
                        <strong>{item.label}</strong>
                      </div>
                      <div className="pf-standard-case-field">
                        <span className="pf-standard-case-label">Area</span>
                        <strong>{item.area?.name ?? "-"}</strong>
                      </div>
                      <div className="pf-standard-case-field">
                        <span className="pf-standard-case-label">Livello</span>
                        <strong>{item.athleteLevel ?? "-"}</strong>
                      </div>
                      <div className="pf-standard-case-field pf-standard-case-description">
                        <span className="pf-standard-case-label">Descrizione</span>
                        <p>{item.description ?? "-"}</p>
                      </div>
                    </div>
                    <div className="pf-standard-cases-actions">
                      <Link
                        className="pf-button-secondary"
                        href={`/ai-tuner/test-cases?mode=standard&caseId=${item.id}`}
                      >
                        Apri test
                      </Link>
                      <Link
                        className="pf-button-secondary"
                        href={`/ai-tuner/golden-contexts?edit=${item.id}&returnTo=${standardCasesReturn}`}
                      >
                        Modifica
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {currentMode === "standard" && selectedCaseId && result && runSnapshot && (
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
                    <strong>{runSnapshot.athleteLevel ?? "Non indicato"}</strong>
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
                  <pre className="pf-readonly-code">{visiblePromptText()}</pre>
                </details>

                <details className="pf-panel pf-test-result-disclosure">
                  <summary>
                    <span>Contesto del caso test</span>
                    <small>Dati del caso passati insieme al prompt.</small>
                  </summary>
                  <pre className="pf-readonly-code">{runSnapshot.context}</pre>
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

                <div className="pf-dashboard-grid">
                  <div className="pf-panel">
                    <h2>Impostazioni test</h2>
                    <div className="pf-stack">
                      <label className="pf-field">
                        Prompt da testare
                        <select
                          className="pf-select"
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                        >
                          {promptOptions.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <label className="pf-field">
                        Versione prompt
                        <select
                          className="pf-select"
                          value={version}
                          onChange={(event) => setVersion(event.target.value)}
                        >
                          <option>Versione attiva</option>
                          <option>Bozza corrente</option>
                          <option>Versione precedente</option>
                          <option>Versione duplicata / sperimentale</option>
                        </select>
                      </label>
                      <label className="pf-field">
                        Provider AI
                        <select
                          className="pf-select"
                          value={provider}
                          onChange={(event) =>
                            setProvider(event.target.value as ProviderChoice)
                          }
                        >
                          <option value="configured">Provider configurato</option>
                          <option value="stub">Stub</option>
                          <option value="gemini">Gemini</option>
                          <option value="openai">OpenAI</option>
                        </select>
                      </label>
                      <div className="pf-form-actions">
                        <button
                          type="button"
                          className="pf-button"
                          disabled={running}
                          onClick={() => runStandardTest()}
                        >
                          {running ? "Test in corso..." : "Esegui test"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <aside className="pf-panel">
                    <h2>Esecuzione test</h2>
                    {message && <div className="pf-alert warning">{message}</div>}
                    {!message && (
                      <p className="pf-muted">
                        Dopo l'esecuzione si aprira la schermata del risultato con
                        prompt, dettagli del test e risposta AI.
                      </p>
                    )}
                  </aside>
                </div>

                {renderTestHistory({
                  title: "Storico test eseguiti",
                  description:
                    "Test eseguiti con questo caso, prompt, versione e provider selezionati. Clicca una riga per riaprire il risultato.",
                  emptyMessage:
                    "Non ci sono ancora test eseguiti con questo prompt e queste condizioni.",
                  items: selectedGoldenHistory,
                })}
              </div>
            )}
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
      </div>
    </ProductShell>
  );
}
