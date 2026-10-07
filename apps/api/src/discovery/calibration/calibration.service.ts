import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiProposalProviderService } from '../../ai-orchestrator/proposal-provider.service';
import { loadActiveAssessmentPrompt } from '../../ai-orchestrator/assessment-prompts';
import { CalibrationQuestion } from '../../ai-orchestrator/calibration-questions';
import { loadOperationalTemplates } from '../assessment-configuration';
import {
  buildAssessmentEvaluationInput,
  requireAiConsent,
  saveEvaluation,
} from '../assessment-evaluation';
import { loadSpecialistQuestionRecords } from '../../onboarding/onboarding-questions';
import { PrismaService } from '../../prisma/prisma.service';
import { loadCalibrationSettings } from './calibration-config';
import {
  CalibrationStatus,
  dayOf,
  nextRoundAt,
  nextRoundKind,
  roundTargets,
  statusAfterEvaluation,
} from './calibration-rules';

const LEASE_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type RoundKind = 'ADAPTIVE' | 'CLOSING';
type Answers = Record<string, string>;

/** Annulla la transazione quando il round risulta già valutato da un'altra richiesta. */
class RoundAlreadyEvaluated extends Error {}

/**
 * Calibrazione gratuita dopo la prima valutazione: round di domande scritte
 * dall'AI sui driver meno affidabili, nuova valutazione a ogni round, chiusura
 * alla soglia di confidence o con l'assessment di chiusura.
 */
@Injectable()
export class CalibrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProposalProviderService,
  ) {}

  /**
   * Avvia la calibrazione dalla prima valutazione (idempotente). Gli atleti
   * valutati prima di questa funzione partono dalla data della loro valutazione.
   */
  async ensureStarted(userId: string) {
    const existing = await this.prisma.athleteCalibration.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    const first = await this.prisma.assessmentEvaluation.findFirst({
      where: { userId },
      orderBy: { sequence: 'asc' },
      include: { areas: true },
    });
    if (!first) return null;
    const settings = await loadCalibrationSettings(this.prisma);
    const next = statusAfterEvaluation(
      'FREE_CALIBRATING',
      { levelConfidence: first.levelConfidence, drivers: first.areas },
      settings,
      'INITIAL',
    );
    await this.prisma.athleteCalibration.createMany({
      data: [
        {
          userId,
          startedAt: first.createdAt,
          deadlineAt: new Date(
            first.createdAt.getTime() + settings.maxDays * DAY_MS,
          ),
          status: next.status,
          levelEstimatedAt: next.levelEstimated ? first.createdAt : null,
          completedAt:
            next.status === 'CALIBRATION_COMPLETED' ? first.createdAt : null,
          completionReason: next.completionReason ?? null,
        },
      ],
      skipDuplicates: true,
    });
    return this.prisma.athleteCalibration.findUnique({ where: { userId } });
  }

  /** Stato mostrato all'atleta: giorno, soglia, round aperto senza punteggi. */
  async view(userId: string, now = new Date()) {
    const calibration = await this.ensureStarted(userId);
    if (!calibration) return null;
    const settings = await loadCalibrationSettings(this.prisma);
    const [open, last, evaluations] = await Promise.all([
      this.prisma.calibrationRound.findFirst({
        where: { userId, status: { in: ['OPEN', 'EVALUATING'] } },
        orderBy: { sequence: 'desc' },
      }),
      this.prisma.calibrationRound.findFirst({
        where: { userId },
        orderBy: { sequence: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.calibrationRound.count({
        where: { userId, status: 'EVALUATED' },
      }),
    ]);
    const completed = calibration.status === 'CALIBRATION_COMPLETED';
    const available = nextRoundAt(last?.createdAt ?? null, settings);
    return {
      status: calibration.status as CalibrationStatus,
      startedAt: calibration.startedAt,
      deadlineAt: calibration.deadlineAt,
      day: Math.min(dayOf(calibration.startedAt, now), settings.maxDays),
      maxDays: settings.maxDays,
      confidenceThreshold: settings.confidenceThreshold,
      completedAt: calibration.completedAt,
      completionReason: calibration.completionReason,
      roundsCompleted: evaluations,
      nextRoundKind: completed
        ? null
        : nextRoundKind(calibration.startedAt, now, settings),
      nextRoundAt:
        completed || open || !available || available <= now ? null : available,
      round: open
        ? {
            id: open.id,
            kind: open.kind,
            status: open.status,
            // Lo score delle opzioni resta sul server: l'atleta vede solo le etichette.
            questions: (open.questionsJson as CalibrationQuestion[]).map(
              (q) => ({
                id: q.id,
                areaId: q.areaId,
                text: q.text,
                options: q.options.map(({ value, label }) => ({
                  value,
                  label,
                })),
              }),
            ),
            answers: open.answersJson as Answers,
          }
        : null,
    };
  }

  /** Apre il prossimo round: domande AI sui driver sotto soglia. */
  async openRound(userId: string, now = new Date()) {
    const calibration = await this.ensureStarted(userId);
    if (!calibration)
      throw new ConflictException('Completa prima la valutazione iniziale');
    if (calibration.status === 'CALIBRATION_COMPLETED')
      throw new ConflictException('La calibrazione è già completata');
    const settings = await loadCalibrationSettings(this.prisma);
    await requireAiConsent(this.prisma, userId);
    const lease = await this.claim(userId);
    try {
      const rounds = await this.prisma.calibrationRound.findMany({
        where: { userId },
        orderBy: { sequence: 'asc' },
      });
      // Un round già aperto vale per tutte le richieste concorrenti.
      if (rounds.some((r) => r.status !== 'EVALUATED')) return;
      const available = nextRoundAt(rounds.at(-1)?.createdAt ?? null, settings);
      if (available && available > now)
        throw new ConflictException({
          code: 'CALIBRATION_ROUND_NOT_YET',
          message: 'Il prossimo round sarà disponibile più tardi.',
          availableAt: available.toISOString(),
        });
      const latest = await this.prisma.assessmentEvaluation.findFirstOrThrow({
        where: { userId },
        orderBy: { sequence: 'desc' },
        include: { areas: { include: { area: { select: { name: true } } } } },
      });
      const kind = nextRoundKind(calibration.startedAt, now, settings);
      const drivers = latest.areas.map((a) => ({
        areaId: a.areaId,
        name: a.area.name,
        score: a.score,
        confidence: a.confidence,
        evidenceGaps: a.evidenceGaps as string[],
      }));
      const targets = roundTargets(drivers, kind, settings);
      // Nessun driver sotto soglia: la valutazione corrente chiude già la calibrazione.
      if (!targets.length) {
        await this.complete(userId, 'CONFIDENCE_REACHED', now);
        return;
      }
      const asked = await this.askedQuestions(userId, rounds);
      const prompt = await loadActiveAssessmentPrompt(
        this.prisma,
        'CALIBRATION',
      );
      const input = await this.evaluationInput(userId, rounds);
      const result = await this.ai.generateCalibrationQuestions({
        basePrompt: prompt.basePrompt,
        promptVersionId: prompt.promptVersionId,
        kind,
        questionsPerDriver: settings.questionsPerDriver,
        scale: input.scale,
        athleteContext: input.athleteContext,
        targets: targets.map((t) => ({
          ...t,
          askedQuestions: asked.get(t.areaId) ?? [],
        })),
      });
      await this.prisma.calibrationRound.create({
        data: {
          userId,
          sequence: (rounds.at(-1)?.sequence ?? 0) + 1,
          kind,
          questionsJson: result.questions as unknown as Prisma.InputJsonValue,
          provider: result.provider,
          model: result.model,
          promptVersionId: prompt.promptVersionId,
          promptHash: result.promptHash,
        },
      });
    } finally {
      await this.release(userId, lease);
    }
  }

  /** Salva le risposte del round e rivaluta R e confidence di tutti i driver. */
  async answerRound(
    userId: string,
    roundId: string,
    answers: Answers,
    now = new Date(),
  ) {
    const round = await this.prisma.calibrationRound.findFirst({
      where: { id: roundId, userId },
    });
    if (!round) throw new NotFoundException('Round non trovato');
    if (round.status === 'EVALUATED') return;
    const questions = round.questionsJson as CalibrationQuestion[];
    const invalid = questions.some(
      (q) => !q.options.some((o) => o.value === answers[q.id]),
    );
    if (invalid || Object.keys(answers).length !== questions.length)
      throw new BadRequestException('Rispondi a tutte le domande del round');
    await requireAiConsent(this.prisma, userId);
    const lease = await this.claim(userId);
    try {
      const claimed = await this.prisma.calibrationRound.updateMany({
        where: { id: roundId, status: { in: ['OPEN', 'EVALUATING'] } },
        data: {
          status: 'EVALUATING',
          answersJson: answers,
          answeredAt: now,
        },
      });
      if (!claimed.count) return;
      try {
        await this.evaluateRound(userId, roundId, now);
      } catch (error) {
        // Un'altra richiesta ha già chiuso il round: vale la sua valutazione.
        if (error instanceof RoundAlreadyEvaluated) return;
        // Le risposte restano salvate: l'atleta può riprovare la valutazione.
        await this.prisma.calibrationRound.updateMany({
          where: { id: roundId, status: 'EVALUATING' },
          data: { status: 'OPEN' },
        });
        throw error;
      }
    } finally {
      await this.release(userId, lease);
    }
  }

  private async evaluateRound(userId: string, roundId: string, now: Date) {
    const rounds = await this.prisma.calibrationRound.findMany({
      where: { userId },
      orderBy: { sequence: 'asc' },
    });
    const round = rounds.find((r) => r.id === roundId)!;
    const input = await this.evaluationInput(userId, rounds);
    const result = await this.ai.evaluateAssessment(input);
    const settings = await loadCalibrationSettings(this.prisma);
    const calibration = await this.prisma.athleteCalibration.findUniqueOrThrow({
      where: { userId },
    });
    const next = statusAfterEvaluation(
      calibration.status as CalibrationStatus,
      {
        levelConfidence: result.output.levelConfidence,
        drivers: result.output.drivers,
      },
      settings,
      round.kind as RoundKind,
    );
    const completed = next.status === 'CALIBRATION_COMPLETED';
    await this.prisma.$transaction(async (tx) => {
      const last = await tx.assessmentEvaluation.findFirstOrThrow({
        where: { userId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const saved = await saveEvaluation(tx, userId, input, result, {
        sequence: last.sequence + 1,
        source:
          round.kind === 'CLOSING' ? 'CLOSING_ASSESSMENT' : 'CALIBRATION_ROUND',
        status: completed ? 'CONSOLIDATED' : 'PROVISIONAL',
      });
      // Un lease scaduto può far valutare lo stesso round due volte: vince il primo.
      const linked = await tx.calibrationRound.updateMany({
        where: { id: roundId, status: 'EVALUATING' },
        data: { status: 'EVALUATED', evaluationId: saved.id },
      });
      if (!linked.count) throw new RoundAlreadyEvaluated();
      await tx.athleteCalibration.update({
        where: { userId },
        data: {
          status: next.status,
          ...(next.levelEstimated ? { levelEstimatedAt: now } : {}),
          ...(completed
            ? { completedAt: now, completionReason: next.completionReason }
            : {}),
        },
      });
    });
  }

  /**
   * Input completo per la rivalutazione: primo set, risposte di tutti i round
   * valutati o in valutazione, stima precedente per driver.
   */
  private async evaluationInput(
    userId: string,
    rounds: { status: string; questionsJson: unknown; answersJson: unknown }[],
  ) {
    const [bank, operational, discovery, latest] = await Promise.all([
      loadSpecialistQuestionRecords(this.prisma, userId),
      loadOperationalTemplates(this.prisma),
      this.prisma.athleteDiscovery.findUniqueOrThrow({ where: { userId } }),
      this.prisma.assessmentEvaluation.findFirstOrThrow({
        where: { userId },
        orderBy: { sequence: 'desc' },
        include: { areas: true },
      }),
    ]);
    const input = await buildAssessmentEvaluationInput(
      this.prisma,
      userId,
      [...operational, ...bank],
      discovery.assessmentAnswers as Record<string, unknown>,
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
    for (const round of rounds.filter((r) => r.status !== 'OPEN')) {
      const answers = round.answersJson as Answers;
      for (const q of round.questionsJson as CalibrationQuestion[]) {
        const driver = input.drivers.find((d) => d.areaId === q.areaId);
        const option = q.options.find((o) => o.value === answers[q.id]);
        if (!driver || !option) continue;
        const scores = q.options.map((o) => o.score);
        driver.answers.push({
          question: q.text,
          answer: option.label,
          optionScore: option.score,
          optionScoreRange: {
            min: Math.min(...scores),
            max: Math.max(...scores),
          },
          source: 'CALIBRATION',
        });
      }
    }
    return input;
  }

  private async askedQuestions(
    userId: string,
    rounds: { questionsJson: unknown }[],
  ) {
    const asked = new Map<string, string[]>();
    const add = (areaId: string | null, text: string) => {
      if (!areaId) return;
      asked.set(areaId, [...(asked.get(areaId) ?? []), text]);
    };
    for (const q of await loadSpecialistQuestionRecords(this.prisma, userId))
      add(q.areaId, q.label);
    for (const round of rounds)
      for (const q of round.questionsJson as CalibrationQuestion[])
        add(q.areaId, q.text);
    return asked;
  }

  private async complete(
    userId: string,
    reason: 'CONFIDENCE_REACHED' | 'CLOSING_ASSESSMENT',
    now: Date,
  ) {
    await this.prisma.athleteCalibration.updateMany({
      where: { userId, status: { not: 'CALIBRATION_COMPLETED' } },
      data: {
        status: 'CALIBRATION_COMPLETED',
        completedAt: now,
        completionReason: reason,
      },
    });
  }

  /** Una sola operazione AI alla volta per atleta; un lease scaduto si riprende. */
  private async claim(userId: string) {
    const lease = new Date();
    const claimed = await this.prisma.athleteCalibration.updateMany({
      where: {
        userId,
        OR: [
          { operationAt: null },
          { operationAt: { lt: new Date(lease.getTime() - LEASE_MS) } },
        ],
      },
      data: { operationAt: lease },
    });
    if (!claimed.count)
      throw new ConflictException(
        'Elaborazione già in corso. Attendi e riprendi il percorso.',
      );
    return lease;
  }

  /** Rilascia solo il proprio lease: uno scaduto e ripreso da altri resta loro. */
  private async release(userId: string, lease: Date) {
    await this.prisma.athleteCalibration.updateMany({
      where: { userId, operationAt: lease },
      data: { operationAt: null },
    });
  }
}
