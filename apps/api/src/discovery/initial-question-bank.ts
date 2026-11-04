import { Prisma } from '@prisma/client';
import { loadActiveAssessmentPrompt } from '../ai-orchestrator/assessment-prompts';
import { loadScaleConfig } from '../ai-orchestrator/performance-scoring';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { normalizeOptions } from '../onboarding/onboarding-answers';
import {
  INITIAL_QUESTIONS_KIND,
  loadSpecialistQuestionRecords,
} from '../onboarding/onboarding-questions';
import type { TemplateRecord } from '../onboarding/onboarding-model';
import { chosenOptions } from './choice-answers';
import { PrismaService } from '../prisma/prisma.service';
import {
  assessmentConfigurationError,
  loadAssessmentConfiguration,
} from './assessment-configuration';
import { discoveryContext } from './discovery-context';
import { loadFitRankingContext } from './fit-ranking/fit-ranking';

/**
 * Scrive con l'AI le domande conoscitive del prossimo driver ancora senza
 * domande, a coppie (`perArea` per driver, back office), nell'ordine dei
 * driver: lo stesso giro dello Spider. L'AI riceve funnel, classifica FIT e
 * le risposte già date ai driver precedenti. Va chiamata sotto il lease del
 * percorso. Se l'AI non risponde l'errore arriva all'atleta, che riprova:
 * nessuna domanda di riserva. Restituisce false se non c'era niente da
 * scrivere (driver tutti coperti o domande precedenti senza risposta).
 */
export async function generateNextInitialQuestions(
  prisma: PrismaService,
  ai: AiProposalProviderService,
  userId: string,
) {
  const [config, bank, saved] = await Promise.all([
    loadAssessmentConfiguration(prisma, userId),
    loadSpecialistQuestionRecords(prisma, userId),
    prisma.athleteDiscovery.findUniqueOrThrow({ where: { userId } }),
  ]);
  if (config.problems.length)
    throw assessmentConfigurationError(config.problems);
  const covered = new Set(bank.map((q) => q.areaId));
  const next = config.areas.find((a) => !covered.has(a.id));
  // Le domande già scritte vanno prima risposte: la coppia nuova parte da lì.
  if (!next || saved.currentQuestion < bank.length) return false;
  const [prompt, scale, discovery, fitRanking] = await Promise.all([
    loadActiveAssessmentPrompt(prisma, 'INITIAL_QUESTIONS'),
    loadScaleConfig(prisma),
    discoveryContext(prisma, userId),
    loadFitRankingContext(prisma, userId),
  ]);
  const answers = saved.assessmentAnswers as Record<string, unknown>;
  const label = (q: TemplateRecord) => {
    const options = normalizeOptions(q.optionsJson) as {
      value: unknown;
      label?: string;
    }[];
    const picked = chosenOptions(options, answers[q.id], q.multiple) ?? [];
    return picked.length ? picked.map((o) => o.label).join(', ') : null;
  };
  // Disponibilità solo per chi l'aveva già data nel vecchio percorso.
  const availability = config.operational
    .map((q) => ({ question: q.label, answer: label(q) }))
    .filter((a) => a.answer !== null);
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
    drivers: [{ areaId: next.id, name: next.name }],
    previousAnswers: bank.map((q) => ({
      driver: q.area?.name ?? '',
      question: q.label,
      answer: label(q),
    })),
    questionsPerArea: config.perArea,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    // Una richiesta concorrente ha già scritto le domande di questo driver.
    if (
      await tx.userOnboardingQuestion.count({
        where: { userId, areaId: next.id },
      })
    )
      return false;
    let position = await tx.userOnboardingQuestion.count({
      where: { userId },
    });
    for (const question of result.questions)
      await tx.userOnboardingQuestion.create({
        data: {
          userId,
          areaId: question.areaId,
          text: question.text,
          orderIndex: ++position,
          inputType: 'SELECT',
          optionsJson: question.options as Prisma.InputJsonValue,
          multiple: question.multiple ?? false,
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
 * Classifica FIT cambiata dal profilo prima della prima valutazione: le
 * domande dei driver erano su misura per la classifica precedente, quindi si
 * cancellano con le loro risposte e l'AI le riscrive, coppia per coppia.
 */
export async function dropStaleBank(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const bank = await tx.userOnboardingQuestion.findMany({
    where: { userId },
    select: { id: true },
  });
  if (!bank.length) return false;
  const saved = await tx.athleteDiscovery.findUnique({ where: { userId } });
  if (!saved) return false;
  await tx.userOnboardingQuestion.deleteMany({ where: { userId } });
  const answers = Object.fromEntries(
    Object.entries(saved.assessmentAnswers as Record<string, unknown>).filter(
      ([id]) => !bank.some((q) => q.id === id),
    ),
  );
  await tx.athleteDiscovery.update({
    where: { userId },
    data: {
      assessmentAnswers: answers as Prisma.InputJsonValue,
      // Le domande dei driver sono tutta la sequenza: si riparte da capo.
      currentQuestion: 0,
    },
  });
  return true;
}
