import { Prisma } from '@prisma/client';
import { loadActiveAssessmentPrompt } from '../ai-orchestrator/assessment-prompts';
import { loadScaleConfig } from '../ai-orchestrator/performance-scoring';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { normalizeOptions } from '../onboarding/onboarding-answers';
import { INITIAL_QUESTIONS_KIND } from '../onboarding/onboarding-questions';
import { PrismaService } from '../prisma/prisma.service';
import {
  assessmentConfigurationError,
  loadAssessmentConfiguration,
} from './assessment-configuration';
import { discoveryContext } from './discovery-context';
import {
  FIT_RANKING_FIELDS,
  fitRankingFromAnswers,
  loadFitRankingContext,
} from './fit-ranking/fit-ranking';

/**
 * Scrive con l'AI le domande conoscitive iniziali di ogni driver, su misura
 * per funnel, disponibilità e classifica FIT, e le salva nella banca per
 * atleta nell'ordine dei driver. Va chiamata sotto il lease del percorso.
 * Se l'AI non risponde l'errore arriva all'atleta, che riprova: nessuna
 * domanda di riserva. Restituisce false se la banca c'era già.
 */
export async function generateInitialQuestionBank(
  prisma: PrismaService,
  ai: AiProposalProviderService,
  userId: string,
) {
  if (await prisma.userOnboardingQuestion.count({ where: { userId } }))
    return false;
  const config = await loadAssessmentConfiguration(prisma, userId);
  if (config.problems.length)
    throw assessmentConfigurationError(config.problems);
  const [saved, prompt, scale, discovery, fitRanking] = await Promise.all([
    prisma.athleteDiscovery.findUniqueOrThrow({ where: { userId } }),
    loadActiveAssessmentPrompt(prisma, 'INITIAL_QUESTIONS'),
    loadScaleConfig(prisma),
    discoveryContext(prisma, userId),
    loadFitRankingContext(prisma, userId),
  ]);
  const answers = saved.assessmentAnswers as Record<string, unknown>;
  const availability = config.operational.map((q) => {
    const value = answers[q.id];
    const option = (
      normalizeOptions(q.optionsJson) as { value: unknown; label?: string }[]
    ).find((o) => String(o.value) === String(value));
    return { question: q.label, answer: option?.label ?? null };
  });
  const result = await ai.generateInitialQuestions({
    basePrompt: prompt.basePrompt,
    promptVersionId: prompt.promptVersionId,
    scale: { minScore: scale.minScore, maxScore: scale.maxScore },
    athleteContext: (discovery?.templates ?? []).map((t, i) => ({
      question: t.label,
      answer: discovery!.answers[i]?.value ?? null,
    })),
    availability,
    fitRanking,
    drivers: config.areas.map((a) => ({ areaId: a.id, name: a.name })),
    questionsPerArea: config.perArea,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    if (await tx.userOnboardingQuestion.count({ where: { userId } }))
      return false;
    let position = 0;
    for (const question of result.questions)
      await tx.userOnboardingQuestion.create({
        data: {
          userId,
          areaId: question.areaId,
          text: question.text,
          orderIndex: ++position,
          inputType: 'SELECT',
          optionsJson: question.options as Prisma.InputJsonValue,
          provider: result.provider,
          model: result.model,
          promptVersion: prompt.promptVersionId ?? 'default',
          promptHash: result.promptHash,
          inputJson: {
            kind: INITIAL_QUESTIONS_KIND,
            sportKey: config.sportKey,
            questionsPerArea: config.perArea,
            attempts: result.attempts,
            latencyMs: result.latencyMs,
          },
        },
      });
    return true;
  });
}

/**
 * Classifica FIT cambiata dopo che l'AI ha scritto le domande dei driver:
 * erano su misura per la classifica precedente, quindi si cancellano con le
 * loro risposte e l'AI le riscrive. Restituisce le risposte da salvare.
 */
export async function dropStaleBank(
  tx: Prisma.TransactionClient,
  userId: string,
  saved: { assessmentAnswers: Prisma.JsonValue },
  answers: Record<string, unknown>,
  questions: { id: string; areaId: string | null }[],
) {
  const before = fitRankingFromAnswers(
    saved.assessmentAnswers as Record<string, unknown>,
  );
  const after = fitRankingFromAnswers(answers);
  const changed = FIT_RANKING_FIELDS.some(
    ({ field }) => before?.[field] !== after?.[field],
  );
  const bank = questions.filter((q) => q.areaId);
  if (!changed || !bank.length) return answers;
  await tx.userOnboardingQuestion.deleteMany({ where: { userId } });
  return Object.fromEntries(
    Object.entries(answers).filter(([id]) => !bank.some((q) => q.id === id)),
  );
}
