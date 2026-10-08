import { useCallback, useEffect, useState } from "react";
import { API_BASE, secureFetch } from "@/app/lib/api";
import { readError } from "../prompt-management-model";

export type AssessmentPromptKind = "EVALUATION" | "CALIBRATION" | "MICRO_TEST";

export type AssessmentPrompt = {
  id?: string;
  name: string;
  basePrompt: string;
  version?: number;
  isActive: boolean;
  updatedAt?: string;
};

export type AssessmentTestCase = {
  id: string;
  athlete: string;
  createdAt: string;
  provider: string;
};

export type CalibrationTestOutput = {
  questions: {
    id: string;
    areaId: string;
    name?: string;
    text: string;
    options: { value: string; label: string; score: number }[];
  }[];
};

export type MicroTestTestOutput = {
  tests: {
    areaId: string;
    name?: string;
    title: string;
    instructions: string;
    options: { value: string; label: string; score: number }[];
  }[];
};

export type AssessmentTestResult = {
  provider: string;
  model: string;
  latencyMs: number;
  output:
    | CalibrationTestOutput
    | MicroTestTestOutput
    | {
        summary: string;
        overallConfidence: number;
        drivers: {
          areaId: string;
          name?: string;
          score: number;
          confidence: number;
          rationale: string;
          evidenceGaps: string[];
        }[];
      };
};

const post = (path: string, body: unknown) =>
  secureFetch(`${API_BASE}/ai-tuning/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Stesso flusso del prompt obiettivo: modificare il prompt in uso crea una bozza. */
export function useAssessmentPrompts(
  kind: AssessmentPromptKind = "EVALUATION",
) {
  const [prompts, setPrompts] = useState<AssessmentPrompt[]>([]);
  const [draft, setDraft] = useState<AssessmentPrompt | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [test, setTest] = useState<AssessmentTestResult | null>(null);
  const [testCases, setTestCases] = useState<AssessmentTestCase[]>([]);
  // Vuoto = caso sintetico: nessun dato reale esce senza una scelta esplicita.
  const [testCaseId, setTestCaseId] = useState("");

  const load = useCallback(async () => {
    const response = await secureFetch(
      `${API_BASE}/ai-tuning/assessment-prompts?kind=${kind}`,
      { credentials: "include" },
    );
    if (!response.ok) {
      setMessage(`Caricamento non riuscito: ${await readError(response)}`);
      return [];
    }
    const items = (await response.json()) as AssessmentPrompt[];
    setPrompts(items);
    return items;
  }, [kind]);

  useEffect(() => {
    // Le domande di calibrazione si provano solo sul caso sintetico.
    if (kind !== "EVALUATION") return;
    void secureFetch(`${API_BASE}/ai-tuning/assessment-prompt/test-cases`, {
      credentials: "include",
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((items: AssessmentTestCase[]) => setTestCases(items))
      .catch(() => setTestCases([]));
  }, [kind]);

  useEffect(() => {
    void load().then((items) =>
      setDraft(
        (current) =>
          current ?? items.find((p) => p.isActive) ?? items[0] ?? null,
      ),
    );
  }, [load]);

  const original = prompts.find((p) => p.id && p.id === draft?.id);
  const changed =
    !!draft &&
    (!original ||
      original.name !== draft.name ||
      original.basePrompt !== draft.basePrompt);

  async function save() {
    if (!draft) return;
    setBusy("save");
    setMessage(null);
    // Il prompt in uso non si sovrascrive: le modifiche diventano una nuova bozza.
    const asNewDraft = !draft.id || draft.isActive;
    const response = await post("assessment-prompt", {
      ...(asNewDraft ? { kind } : { id: draft.id }),
      name: asNewDraft
        ? `${draft.name.replace(/ bozza.*$/, "")} bozza ${new Date().toISOString().slice(0, 16).replace("T", " ")}`
        : draft.name,
      basePrompt: draft.basePrompt,
      isActive: false,
    });
    setBusy(null);
    if (!response.ok) {
      setMessage(`Salvataggio non riuscito: ${await readError(response)}`);
      return;
    }
    const saved = (await response.json()) as AssessmentPrompt;
    await load();
    setDraft(saved);
    setMessage("Bozza salvata.");
  }

  async function activate(prompt: AssessmentPrompt) {
    if (!prompt.id) return;
    setBusy(`activate-${prompt.id}`);
    setMessage(null);
    const response = await post("assessment-prompt", {
      id: prompt.id,
      name: prompt.name,
      basePrompt: prompt.basePrompt,
      isActive: true,
    });
    setBusy(null);
    if (!response.ok) {
      setMessage(`Attivazione non riuscita: ${await readError(response)}`);
      return;
    }
    const saved = (await response.json()) as AssessmentPrompt;
    await load();
    setDraft(saved);
    setMessage(
      kind === "EVALUATION"
        ? "Prompt attivato: le prossime valutazioni useranno questa versione."
        : "Prompt attivato: i prossimi round di domande useranno questa versione.",
    );
  }

  async function runTest() {
    if (!draft) return;
    setBusy("test");
    setMessage(null);
    setTest(null);
    const response = await post("assessment-prompt/test", {
      kind,
      basePrompt: draft.basePrompt,
      ...(testCaseId ? { evaluationId: testCaseId } : {}),
    });
    setBusy(null);
    if (!response.ok) {
      setMessage(`Prova non riuscita: ${await readError(response)}`);
      return;
    }
    setTest((await response.json()) as AssessmentTestResult);
  }

  return {
    prompts,
    draft,
    setDraft,
    changed,
    busy,
    message,
    test,
    save,
    activate,
    runTest,
    testCases,
    testCaseId,
    setTestCaseId,
  };
}
