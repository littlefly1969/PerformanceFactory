import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import {
  AssessmentEvaluationInput,
  AssessmentEvaluationResult,
} from '../ai-orchestrator/assessment-evaluation-model';
import { loadActiveAssessmentPrompt } from '../ai-orchestrator/assessment-prompts';
import { loadScaleConfig } from '../ai-orchestrator/performance-scoring';
import { TemplateRecord } from '../onboarding/onboarding-model';
import { normalizeOptions } from '../onboarding/onboarding-answers';
import { performanceDriverName as driverName } from '../performance/performance-display';
import { PrismaService } from '../prisma/prisma.service';
import { discoveryContext } from './discovery-context';

type Option = { value: unknown; label?: string; score?: unknown };

/**
 * Input AI_ASSESSMENT: risposte leggibili con i punteggi delle opzioni come
 * ancoraggio. Ogni driver attivo è presente anche senza domande di anamnesi:
 * l'AI lo valuta con confidence bassa e il round successivo lo approfondisce.
 */
export async function buildAssessmentEvaluationInput(
  prisma: PrismaService,
  userId: string,
  questions: TemplateRecord[],
  answers: Record<string, unknown>,
  areas: { id: string; name: string }[],
): Promise<AssessmentEvaluationInput> {
  const [prompt, scale, discovery] = await Promise.all([
    loadActiveAssessmentPrompt(prisma),
    loadScaleConfig(prisma),
    discoveryContext(prisma, userId),
  ]);
  // Risposte già validate contro le opzioni: stringhe o numeri.
  const raw = (q: TemplateRecord) =>
    String((answers[q.id] as string | number | undefined) ?? '');
  const chosen = (q: TemplateRecord) => {
    const options = normalizeOptions(q.optionsJson) as Option[];
    const option = options.find((o) => String(o.value) === raw(q));
    return { options, option };
  };
  const drivers: AssessmentEvaluationInput['drivers'] = areas.map((a) => ({
    areaId: a.id,
    name: driverName(a.name),
    answers: [],
  }));
  for (const q of questions.filter((item) => item.areaId)) {
    const { options, option } = chosen(q);
    const scores = options.map((o) => Number(o.score)).filter(Number.isFinite);
    let driver = drivers.find((d) => d.areaId === q.areaId);
    if (!driver) {
      driver = {
        areaId: q.areaId!,
        name: driverName(q.area?.name ?? ''),
        answers: [],
      };
      drivers.push(driver);
    }
    const score = Number(option?.score);
    driver.answers.push({
      question: q.label,
      answer: option?.label ?? raw(q),
      optionScore: Number.isFinite(score) ? score : null,
      optionScoreRange: scores.length
        ? { min: Math.min(...scores), max: Math.max(...scores) }
        : null,
    });
  }
  return {
    basePrompt: prompt.basePrompt,
    promptVersionId: prompt.promptVersionId,
    scale: { minScore: scale.minScore, maxScore: scale.maxScore },
    athleteContext: (discovery?.templates ?? []).map((t, i) => ({
      question: t.label,
      answer: discovery!.answers[i]?.value ?? null,
    })),
    availability: questions
      .filter((q) => !q.areaId)
      .map((q) => ({
        question: q.label,
        answer: chosen(q).option?.label ?? raw(q),
      })),
    drivers,
  };
}

export async function requireAiConsent(prisma: PrismaService, userId: string) {
  if (!AiProposalProviderService.requiresUserConsent()) return;
  const consent = await prisma.consent.findFirst({
    where: { userId, type: { in: ['AI', 'AI_ASSISTANT'] }, withdrawnAt: null },
    select: { id: true },
  });
  if (!consent)
    throw new BadRequestException(
      'Per analizzare le risposte con l’AI serve il consenso all’assistente AI.',
    );
}

export async function runAssessmentEvaluation(
  prisma: PrismaService,
  ai: AiProposalProviderService,
  userId: string,
  questions: TemplateRecord[],
  answers: Record<string, unknown>,
  areas: { id: string; name: string }[],
) {
  await requireAiConsent(prisma, userId);
  const input = await buildAssessmentEvaluationInput(
    prisma,
    userId,
    questions,
    answers,
    areas,
  );
  const result = await ai.evaluateAssessment(input);
  try {
    return await saveEvaluation(prisma, userId, input, result, {
      sequence: INITIAL_SEQUENCE,
      source: 'SELF_ASSESSMENT',
    });
  } catch (error) {
    // Una richiesta concorrente ha già salvato la prima valutazione: vale quella.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      return prisma.assessmentEvaluation.findUniqueOrThrow({
        where: { userId_sequence: { userId, sequence: INITIAL_SEQUENCE } },
        select: { id: true },
      });
    throw error;
  }
}

/** Prima valutazione dell'assessment: unica per atleta grazie a (userId, sequence). */
export const INITIAL_SEQUENCE = 1;

/** Salva una valutazione versionata; sequence e fonte distinguono prima valutazione e round. */
export function saveEvaluation(
  prisma: Pick<PrismaService, 'assessmentEvaluation'>,
  userId: string,
  input: AssessmentEvaluationInput,
  result: AssessmentEvaluationResult,
  meta: {
    sequence: number;
    source: string;
    status?: string;
    consolidationPolicyId?: string;
  },
) {
  return prisma.assessmentEvaluation.create({
    data: {
      userId,
      sequence: meta.sequence,
      source: meta.source,
      ...(meta.status ? { status: meta.status } : {}),
      ...(meta.consolidationPolicyId
        ? { consolidationPolicyId: meta.consolidationPolicyId }
        : {}),
      summary: result.output.summary,
      overallConfidence: result.output.overallConfidence,
      level: result.output.level,
      levelConfidence: result.output.levelConfidence,
      minScore: input.scale.minScore,
      maxScore: input.scale.maxScore,
      provider: result.provider,
      model: result.model,
      promptVersionId: input.promptVersionId,
      promptHash: result.promptHash,
      inputJson: result.inputJson as Prisma.InputJsonValue,
      outputJson: result.output as unknown as Prisma.InputJsonValue,
      latencyMs: result.latencyMs,
      areas: {
        create: result.output.drivers.map((d) => ({
          areaId: d.areaId,
          score: d.score,
          confidence: d.confidence,
          rationale: d.rationale,
          evidenceGaps: d.evidenceGaps,
          commitment: d.commitment,
        })),
      },
    },
    select: { id: true, createdAt: true },
  });
}

/** Ultima valutazione nel formato mostrato all'atleta: R provvisoria, mai P. */
export async function loadAssessmentEvaluation(
  prisma: PrismaService,
  userId: string,
  orderedAreas: string[],
) {
  const evaluation = await prisma.assessmentEvaluation.findFirst({
    where: { userId },
    orderBy: { sequence: 'desc' },
    include: { areas: { include: { area: { select: { name: true } } } } },
  });
  if (!evaluation) return null;
  const position = (id: string) => {
    const index = orderedAreas.indexOf(id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const drivers = evaluation.areas
    .map((a) => ({
      id: a.areaId,
      name: driverName(a.area.name),
      score: a.score,
      confidence: a.confidence,
      rationale: a.rationale,
      evidenceGaps: a.evidenceGaps as string[],
      commitment: a.commitment,
    }))
    // Un driver senza domande di anamnesi non è nella sequenza: va in fondo.
    .sort((a, b) => position(a.id) - position(b.id));
  return {
    id: evaluation.id,
    status: evaluation.status,
    source: evaluation.source,
    summary: evaluation.summary,
    overallConfidence: evaluation.overallConfidence,
    level: evaluation.level,
    levelConfidence: evaluation.levelConfidence,
    sequence: evaluation.sequence,
    scale: { min: evaluation.minScore, max: evaluation.maxScore },
    createdAt: evaluation.createdAt,
    drivers,
  };
}
