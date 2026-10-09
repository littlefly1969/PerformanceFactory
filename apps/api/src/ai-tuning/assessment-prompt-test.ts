import { NotFoundException } from '@nestjs/common';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { AssessmentEvaluationInput } from '../ai-orchestrator/assessment-evaluation-model';
import { requireAiConsent } from '../discovery/assessment-evaluation';
import { PrismaService } from '../prisma/prisma.service';
import { SYNTHETIC_ASSESSMENT_CASE } from './assessment-synthetic-case';
import { pseudonymizeUserId } from './tuning-audits';

type CaseInput = Omit<
  AssessmentEvaluationInput,
  'basePrompt' | 'promptVersionId'
>;

/** Ultime valutazioni selezionabili come caso di prova, con atleta pseudonimizzato. */
export async function listAssessmentTestCases(prisma: PrismaService) {
  const evaluations = await prisma.assessmentEvaluation.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, userId: true, createdAt: true, provider: true },
  });
  return evaluations.map(({ userId, ...evaluation }) => ({
    ...evaluation,
    athlete: pseudonymizeUserId(userId),
  }));
}

/**
 * Prova una bozza senza salvare nulla. Di default usa il caso sintetico; una
 * valutazione reale va scelta esplicitamente e richiede il consenso AI corrente
 * del suo atleta quando il provider è esterno.
 */
export async function testAssessmentPrompt(
  prisma: PrismaService,
  ai: AiProposalProviderService,
  basePrompt: string,
  evaluationId?: string,
) {
  let input: CaseInput = SYNTHETIC_ASSESSMENT_CASE;
  let previousOutput: unknown = null;
  if (evaluationId) {
    const selected = await prisma.assessmentEvaluation.findUnique({
      where: { id: evaluationId },
      select: { userId: true, inputJson: true, outputJson: true },
    });
    const user = (
      selected?.inputJson as { prompt?: { user?: Partial<CaseInput> } }
    )?.prompt?.user;
    if (!selected || !user?.drivers?.length || !user.scale)
      throw new NotFoundException('Valutazione di prova non trovata');
    await requireAiConsent(prisma, selected.userId);
    input = {
      scale: user.scale,
      athleteContext: user.athleteContext ?? [],
      availability: user.availability ?? [],
      drivers: user.drivers,
    };
    previousOutput = selected.outputJson;
  }
  const result = await ai.evaluateAssessment({
    ...input,
    basePrompt,
    promptVersionId: null,
  });
  return {
    caseEvaluationId: evaluationId ?? null,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    output: {
      ...result.output,
      drivers: result.output.drivers.map((d) => ({
        ...d,
        name: input.drivers.find((x) => x.areaId === d.areaId)?.name,
      })),
    },
    previousOutput,
  };
}

/** Prova il passo di calibrazione sul caso sintetico: due driver in focus a confidence bassa. */
export async function testCalibrationPrompt(
  ai: AiProposalProviderService,
  basePrompt: string,
) {
  const input = SYNTHETIC_ASSESSMENT_CASE;
  const targets = input.drivers.map((driver, i) => ({
    areaId: driver.areaId,
    name: driver.name,
    score: 50,
    confidence: i < 2 ? 30 : 80,
    evidenceGaps:
      i < 2 ? ['Servono esempi concreti di situazioni di gioco.'] : [],
    askedQuestions: driver.answers.map((a) => a.question),
    focus: i < 2,
  }));
  const result = await ai.generateCalibrationQuestions({
    basePrompt,
    promptVersionId: null,
    scale: input.scale,
    athleteContext: input.athleteContext,
    targets,
  });
  return {
    caseEvaluationId: null,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    output: {
      action: result.action,
      rationale: result.rationale,
      questions: result.questions.map((q) => ({
        ...q,
        name: targets.find((t) => t.areaId === q.areaId)?.name,
      })),
    },
    previousOutput: null,
  };
}

/** Prova i micro-test sul caso sintetico: i due driver meno affidabili. */
export async function testMicroTestPrompt(
  ai: AiProposalProviderService,
  basePrompt: string,
) {
  const input = SYNTHETIC_ASSESSMENT_CASE;
  const targets = input.drivers.slice(0, 2).map((driver) => ({
    areaId: driver.areaId,
    name: driver.name,
    score: 50,
    confidence: 30,
    evidenceGaps: ['Manca una prova pratica di quanto dichiarato.'],
    evidence: driver.answers.map((a) => ({
      source: 'ASSESSMENT',
      question: a.question,
      answer: a.answer,
    })),
  }));
  const result = await ai.generateMicroTests({
    basePrompt,
    promptVersionId: null,
    scale: input.scale,
    athleteContext: input.athleteContext,
    targets,
    proposedTitles: [],
  });
  return {
    caseEvaluationId: null,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    output: {
      tests: result.tests.map((t) => ({
        ...t,
        name: targets.find((x) => x.areaId === t.areaId)?.name,
      })),
    },
    previousOutput: null,
  };
}

/** Prova gli scenari P3/P6/P12 sul caso sintetico, con una R consolidata fittizia. */
export async function testPotentialPrompt(
  ai: AiProposalProviderService,
  basePrompt: string,
) {
  const input = SYNTHETIC_ASSESSMENT_CASE;
  const drivers = input.drivers.map((driver, k) => ({
    areaId: driver.areaId,
    name: driver.name,
    score: 40 + k * 8,
    confidence: 75,
    commitment: k % 2 ? 'MEDIUM' : 'HIGH',
    rationale: 'Valutazione consolidata del caso sintetico.',
    evidenceGaps: [],
  }));
  const result = await ai.generatePotential({
    basePrompt,
    promptVersionId: null,
    scale: { min: input.scale.minScore, max: input.scale.maxScore },
    level: 'INTERMEDIATE',
    levelConfidence: 80,
    daysPerWeek: 3,
    drivers,
  });
  return {
    caseEvaluationId: null,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    output: {
      criteria: result.criteria,
      scenarios: result.scenarios.map((s) => {
        const driver = drivers.find((d) => d.areaId === s.areaId);
        return { ...s, name: driver?.name, current: driver?.score };
      }),
    },
    previousOutput: null,
  };
}
