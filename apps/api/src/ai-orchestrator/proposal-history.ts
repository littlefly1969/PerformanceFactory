import { Logger } from '@nestjs/common';
import { buildHistorySummaryAuditInput, hashJson } from './proposal-audit';
import {
  AiProvider,
  CycleHistorySummaryInput,
  CycleHistorySummaryResult,
  HISTORY_SUMMARY_VERSION,
} from './proposal-provider-model';
import {
  summarizeGeminiCycleHistory,
  summarizeOpenAiCycleHistory,
} from './proposal-transport';
import { resolveModel, resolveProvider } from './provider-config';

export async function summarizeCycleHistory(
  logger: Logger,
  input: CycleHistorySummaryInput,
): Promise<CycleHistorySummaryResult> {
  const startedAt = Date.now();
  const provider = resolveProvider();
  const model = resolveModel(provider);
  const inputJson = buildHistorySummaryAuditInput(input);
  if (provider === 'openai') {
    return summarizeOpenAiCycleHistory(logger, input, inputJson, startedAt);
  }
  if (provider === 'gemini') {
    return summarizeGeminiCycleHistory(logger, input, inputJson, startedAt);
  }
  return normalizeHistorySummary(
    provider,
    model,
    {
      summaryText: `Storico sintetico ${input.targetLabel}: ${input.coveredCycles.length} cicli precedenti oltre agli ultimi tre.`,
      stableSignals: [],
      completedWork: [],
      unresolvedRisks: [],
      progressionNotes: [],
    },
    inputJson,
    startedAt,
  );
}

export function normalizeHistorySummary(
  provider: AiProvider,
  model: string,
  parsed: {
    summaryText?: string;
    stableSignals?: string[];
    completedWork?: string[];
    unresolvedRisks?: string[];
    progressionNotes?: string[];
  },
  inputJson: Record<string, unknown>,
  startedAt: number,
): CycleHistorySummaryResult {
  const summaryJson = {
    stableSignals: stringList(parsed.stableSignals),
    completedWork: stringList(parsed.completedWork),
    unresolvedRisks: stringList(parsed.unresolvedRisks),
    progressionNotes: stringList(parsed.progressionNotes),
  };
  const summaryText =
    parsed.summaryText?.trim() ||
    [
      ...summaryJson.stableSignals,
      ...summaryJson.completedWork,
      ...summaryJson.unresolvedRisks,
      ...summaryJson.progressionNotes,
    ].join('\n') ||
    'Nessun elemento storico sintetizzabile oltre agli ultimi tre cicli.';

  return {
    provider,
    model,
    promptVersion: HISTORY_SUMMARY_VERSION,
    promptHash: hashJson(inputJson),
    summaryText,
    summaryJson,
    inputJson,
    outputJson: { summaryText, ...summaryJson },
    latencyMs: Date.now() - startedAt,
  };
}

export function stringList(value?: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 12)
    : [];
}
