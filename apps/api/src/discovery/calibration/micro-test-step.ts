import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AssessmentEvaluationInput } from '../../ai-orchestrator/assessment-evaluation-model';
import { loadActiveAssessmentPrompt } from '../../ai-orchestrator/assessment-prompts';
import {
  CalibrationQuestion,
  CalibrationQuestionsResult,
} from '../../ai-orchestrator/calibration-questions';
import { AiProposalProviderService } from '../../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Micro-test come passo del motore (PF-FS-PREPAYWALL §4.4): il motore sceglie
 * il driver, il generatore dedicato scrive e valida il test, l'atleta riporta
 * l'esito (self-report) o lo salta. Nessun catalogo di riserva e nessun limite
 * giornaliero.
 */

/** Titoli già proposti e risposte recenti del driver passati al generatore. */
const MICRO_TEST_TITLES = 20;
const MICRO_TEST_EVIDENCE = 6;

type MicroTest = NonNullable<CalibrationQuestion['microTest']>;
type Option = CalibrationQuestion['options'][number];

/**
 * Risposta del profilo che dichiara dolori, infortuni o limitazioni: con
 * queste il generatore non può proporre prove a impegno fisico moderato.
 */
export function isDeclaredLimitation(item: {
  question: string;
  answer: string | number | boolean | null;
}) {
  const answer = item.answer === null ? '' : String(item.answer).trim();
  return (
    /infortun|dolor|limitazion|patolog|salute/i.test(item.question) &&
    !!answer &&
    !/^(no|nessun|niente)/i.test(answer)
  );
}

/** Micro-test già proposti per driver, con quelli saltati marcati. */
export function microTestsByArea(
  rounds: { status: string; questionsJson: unknown }[],
) {
  const tests = new Map<string, string[]>();
  for (const round of rounds)
    for (const q of round.questionsJson as CalibrationQuestion[])
      if (q.microTest)
        tests.set(q.areaId, [
          ...(tests.get(q.areaId) ?? []),
          round.status === 'SKIPPED' ? `${q.text} (saltato)` : q.text,
        ]);
  return tests;
}

/**
 * Conteggi della calibrazione passati al motore con l'indicazione del back
 * office: il motore decide, l'indicazione orienta il rapporto prove/domande.
 */
export function microTestBalance(
  rounds: { status: string; action: string | null; questionsJson: unknown }[],
  questionsPerMicroTest: number,
) {
  let microTestsDone = 0;
  let microTestsSkipped = 0;
  let questionsAnswered = 0;
  for (const round of rounds) {
    const microTest = round.action === 'PROPOSE_MICRO_TEST';
    if (round.status === 'SKIPPED' && microTest) microTestsSkipped++;
    if (round.status !== 'EVALUATED') continue;
    if (microTest) microTestsDone++;
    else questionsAnswered += (round.questionsJson as unknown[]).length;
  }
  return {
    questionsPerMicroTest,
    microTestsDone,
    microTestsSkipped,
    questionsAnswered,
  };
}

/**
 * Un micro-test validato sul driver scelto dal motore, con la sua provenienza.
 * Se l'AI non risponde o il test non supera i controlli, lancia: il passo
 * fallisce e si riprova, senza ripiegare sul catalogo (AT-13).
 */
export async function generateMicroTest(
  prisma: PrismaService,
  ai: AiProposalProviderService,
  userId: string,
  input: AssessmentEvaluationInput,
  step: CalibrationQuestionsResult,
) {
  const areaId = step.targetAreas[0];
  const [prompt, proposed, latest] = await Promise.all([
    loadActiveAssessmentPrompt(prisma, 'MICRO_TEST'),
    prisma.microTest.findMany({
      where: { OR: [{ userId }, { completions: { some: { userId } } }] },
      orderBy: { createdAt: 'desc' },
      take: MICRO_TEST_TITLES,
      select: { title: true },
    }),
    prisma.assessmentEvaluation.findFirstOrThrow({
      where: { userId },
      orderBy: { sequence: 'desc' },
      select: { areas: { where: { areaId } } },
    }),
  ]);
  const driver = input.drivers.find((d) => d.areaId === areaId)!;
  const area = latest.areas[0];
  const result = await ai.generateMicroTests({
    basePrompt: prompt.basePrompt,
    promptVersionId: prompt.promptVersionId,
    scale: input.scale,
    athleteContext: input.athleteContext,
    declaredLimitations: input.athleteContext.filter(isDeclaredLimitation),
    reason: step.rationale,
    targets: [
      {
        areaId,
        name: driver.name,
        score: area.score,
        confidence: area.confidence,
        evidenceGaps: area.evidenceGaps as string[],
        evidence: driver.answers
          .slice(-MICRO_TEST_EVIDENCE)
          .map(({ question, answer, source }) => ({
            source: source ?? 'ASSESSMENT',
            question,
            answer,
          })),
      },
    ],
    proposedTitles: proposed.map((p) => p.title),
  });
  return {
    ...result.tests[0],
    provider: result.provider,
    model: result.model,
    promptVersionId: prompt.promptVersionId,
    promptHash: result.promptHash,
  };
}

/**
 * L'unica voce del round del micro-test: il test diventa un `MicroTest`
 * dell'atleta (fuori dal catalogo) e la voce ne conserva la provenienza.
 */
export async function microTestQuestion(
  tx: Prisma.TransactionClient,
  userId: string,
  test: Awaited<ReturnType<typeof generateMicroTest>>,
): Promise<CalibrationQuestion> {
  const { id } = await tx.microTest.create({
    data: {
      areaId: test.areaId,
      title: test.title,
      instructions: test.instructions,
      optionsJson: test.options,
      userId,
    },
    select: { id: true },
  });
  return {
    id: 't1',
    areaId: test.areaId,
    text: test.title,
    options: test.options,
    microTest: {
      id,
      instructions: test.instructions,
      informationGoal: test.informationGoal,
      durationMinutes: test.durationMinutes,
      physicalLoad: test.physicalLoad,
      safetyNotes: test.safetyNotes,
      provider: test.provider,
      model: test.model,
      promptVersionId: test.promptVersionId,
      promptHash: test.promptHash,
    },
  };
}

/** Ciò che l'atleta vede del micro-test: niente provenienza né obiettivo interno. */
export const publicMicroTest = (test: MicroTest | undefined) =>
  test
    ? {
        microTest: {
          instructions: test.instructions,
          durationMinutes: test.durationMinutes,
          safetyNotes: test.safetyNotes,
        },
      }
    : {};

/** Evidenza di una voce del round: l'esito del micro-test è riportato dall'atleta. */
export const roundEvidence = (q: CalibrationQuestion, option: Option) =>
  q.microTest
    ? {
        question: `Micro-test «${q.text}»: ${q.microTest.instructions}`,
        answer: `${option.label} (esito riportato dall'atleta)`,
        source: 'MICRO_TEST' as const,
      }
    : {
        question: q.text,
        answer: option.label,
        source: 'CALIBRATION' as const,
      };

/**
 * L'atleta non può svolgere ora il micro-test proposto: il passo si chiude
 * senza esito e il motore ne sceglie un altro. Nessuna evidenza e nessuna
 * confidence per un test non svolto.
 */
export async function skipMicroTest(
  prisma: PrismaService,
  userId: string,
  roundId: string,
  now: Date,
) {
  const round = await prisma.calibrationRound.findFirst({
    where: { id: roundId, userId },
    select: { status: true, action: true },
  });
  if (!round) throw new NotFoundException('Round non trovato');
  if (round.action !== 'PROPOSE_MICRO_TEST')
    throw new BadRequestException('Solo un micro-test si può saltare');
  if (round.status === 'SKIPPED') return;
  const skipped = await prisma.calibrationRound.updateMany({
    where: { id: roundId, status: 'OPEN' },
    data: { status: 'SKIPPED', answeredAt: now },
  });
  if (!skipped.count)
    throw new ConflictException('Il micro-test è già in valutazione');
}
