import { CalibrationQuestion } from '../../ai-orchestrator/calibration-questions';
import { loadSpecialistQuestionRecords } from '../../onboarding/onboarding-questions';
import { PrismaService } from '../../prisma/prisma.service';
import { loadOperationalTemplates } from '../assessment-configuration';
import { buildAssessmentEvaluationInput } from '../assessment-evaluation';
import { chosenOptions, choiceEvidence } from '../choice-answers';
import { roundEvidence } from './micro-test-step';

/** Id domanda → valore scelto, o elenco di valori se la domanda è multipla. */
type Answers = Record<string, string | string[]>;

/**
 * Input completo per la rivalutazione: primo set, risposte dei round passati
 * (valutati più quello in valutazione), stima precedente per driver.
 */
export async function loadEvaluationInput(
  prisma: PrismaService,
  userId: string,
  rounds: { status: string; questionsJson: unknown; answersJson: unknown }[],
) {
  const [bank, operational, discovery, latest] = await Promise.all([
    loadSpecialistQuestionRecords(prisma, userId),
    loadOperationalTemplates(prisma),
    prisma.athleteDiscovery.findUniqueOrThrow({ where: { userId } }),
    prisma.assessmentEvaluation.findFirstOrThrow({
      where: { userId },
      orderBy: { sequence: 'desc' },
      include: { areas: { include: { area: { select: { name: true } } } } },
    }),
  ]);
  // I driver sono quelli dell'ultima valutazione, anche senza anamnesi.
  const input = await buildAssessmentEvaluationInput(
    prisma,
    userId,
    [...operational, ...bank],
    discovery.assessmentAnswers as Record<string, unknown>,
    latest.areas.map((a) => ({ id: a.areaId, name: a.area.name })),
  );
  for (const driver of input.drivers) {
    for (const answer of driver.answers) answer.source = 'ASSESSMENT';
    const previous = latest.areas.find((a) => a.areaId === driver.areaId);
    if (previous)
      driver.previous = {
        score: previous.score,
        confidence: previous.confidence,
      };
  }
  for (const round of rounds) {
    const answers = round.answersJson as Answers;
    for (const q of round.questionsJson as CalibrationQuestion[]) {
      const driver = input.drivers.find((d) => d.areaId === q.areaId);
      const chosen = chosenOptions(q.options, answers[q.id], q.multiple);
      if (!driver || !chosen) continue;
      const scores = q.options.map((o) => o.score);
      const { answer, ...evidence } = choiceEvidence(chosen, q.multiple);
      driver.answers.push({
        ...roundEvidence(q, { label: answer }),
        ...evidence,
        optionScoreRange: {
          min: Math.min(...scores),
          max: Math.max(...scores),
        },
      });
    }
  }
  return input;
}
