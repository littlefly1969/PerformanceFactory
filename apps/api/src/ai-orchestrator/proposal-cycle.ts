import { BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { buildAuditInput, buildAuditOutput, hashJson } from './proposal-audit';
import {
  AiProvider,
  CycleProposal,
  CycleProposalInput,
  PROMPT_VERSION,
} from './proposal-provider-model';
import { cycleQuestionLayout } from './proposal-schemas';
import {
  generateGeminiProposal,
  generateOpenAiProposal,
} from './proposal-transport';
import { resolveModel, resolveProvider } from './provider-config';

export async function generateCycleProposal(
  logger: Logger,
  input: CycleProposalInput,
): Promise<CycleProposal> {
  const startedAt = Date.now();
  const inputJson = buildAuditInput(input);
  const provider = resolveProvider();
  if (provider === 'openai') {
    return generateOpenAiProposal(logger, input, inputJson, startedAt);
  }
  if (provider === 'gemini') {
    return generateGeminiProposal(logger, input, inputJson, startedAt);
  }
  return generateStubProposal(input, inputJson, startedAt);
}

export function buildCycleProposalPreview(input: CycleProposalInput) {
  const provider = resolveProvider();
  const inputJson = buildAuditInput(input);
  return {
    provider,
    model: resolveModel(provider),
    promptVersion: PROMPT_VERSION,
    promptHash: hashJson(inputJson),
    inputJson,
  };
}

export function generateStubProposal(
  input: CycleProposalInput,
  inputJson: Record<string, unknown>,
  startedAt: number,
): CycleProposal {
  const questionLayout = cycleQuestionLayout(input);
  const proposal = {
    provider: 'stub',
    model: 'deterministic-stub',
    promptVersion: PROMPT_VERSION,
    promptHash: hashJson(inputJson),
    summaryText: input.reason || 'Ciclo AI generato',
    planItems: [
      {
        type: 'FOCUS',
        title: `Focus ${input.area.name}`,
        body: `Attivita generata automaticamente per ${input.area.name}.`,
        metadata: {
          source: 'orchestrator',
          area: input.area.name,
          provider: 'stub',
        },
      },
    ],
    questions: Array.from({ length: questionLayout.questions }, (_, index) => ({
      text: `${input.area.name}: verifica ${index + 1}`,
      objectiveRef: `area:${input.area.id}`,
      orderIndex: index + 1,
      options: questionLayout.answerOptions,
    })),
  } satisfies Omit<CycleProposal, 'audit'>;

  return {
    ...proposal,
    audit: {
      status: 'SUCCESS',
      inputJson,
      outputJson: buildAuditOutput(proposal),
      latencyMs: Date.now() - startedAt,
      correlationId: randomUUID(),
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
  };
}

export function normalizeProposal(
  input: CycleProposalInput,
  provider: AiProvider,
  model: string,
  parsed: {
    summaryText?: string;
    planItems?: Array<{ type?: string; title?: string; body?: string }>;
    questions?: Array<{
      text?: string;
      objectiveRef?: string;
      orderIndex?: number;
    }>;
  },
  inputJson: Record<string, unknown>,
  startedAt: number,
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  },
): CycleProposal {
  const questionLayout = cycleQuestionLayout(input);
  const planItems = (parsed.planItems ?? [])
    .filter((item) => item.title && item.body)
    .slice(0, 3)
    .map((item) => ({
      type: item.type || 'FOCUS',
      title: item.title || `Focus ${input.area.name}`,
      body:
        item.body ||
        `Rivedere gli obiettivi di performance dell'area ${input.area.name}.`,
      metadata: {
        source: 'orchestrator',
        area: input.area.name,
        provider,
        model,
        promptVersion: PROMPT_VERSION,
      },
    }));

  const questions = (parsed.questions ?? [])
    .filter((question) => question.text)
    .slice(0, questionLayout.questions)
    .map((question, index) => ({
      text: question.text || `${input.area.name}: verifica ${index + 1}`,
      objectiveRef: question.objectiveRef || `area:${input.area.id}`,
      orderIndex: question.orderIndex || index + 1,
      options: questionLayout.answerOptions,
    }));

  if (planItems.length === 0 || questions.length !== questionLayout.questions) {
    throw new BadRequestException(
      `Validazione proposta ${provider} non riuscita`,
    );
  }

  const proposal = {
    provider,
    model,
    promptVersion: PROMPT_VERSION,
    promptHash: hashJson(inputJson),
    summaryText: parsed.summaryText || input.reason || 'Ciclo AI generato',
    planItems,
    questions,
  } satisfies Omit<CycleProposal, 'audit'>;

  return {
    ...proposal,
    audit: {
      status: 'SUCCESS',
      inputJson,
      outputJson: buildAuditOutput(proposal),
      latencyMs: Date.now() - startedAt,
      correlationId: randomUUID(),
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    },
  };
}
