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

/** Prova le domande di calibrazione sul caso sintetico: due driver a confidence bassa. */
export async function testCalibrationPrompt(
  ai: AiProposalProviderService,
  basePrompt: string,
) {
  const input = SYNTHETIC_ASSESSMENT_CASE;
  const targets = input.drivers.slice(0, 2).map((driver) => ({
    areaId: driver.areaId,
    name: driver.name,
    score: 50,
    confidence: 30,
    evidenceGaps: ['Servono esempi concreti di situazioni di gioco.'],
    askedQuestions: driver.answers.map((a) => a.question),
  }));
  const result = await ai.generateCalibrationQuestions({
    basePrompt,
    promptVersionId: null,
    kind: 'ADAPTIVE',
    questionsPerDriver: 2,
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
      questions: result.questions.map((q) => ({
        ...q,
        name: targets.find((t) => t.areaId === q.areaId)?.name,
      })),
    },
    previousOutput: null,
  };
}
