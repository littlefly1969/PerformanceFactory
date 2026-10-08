import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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
import { completeCalibration } from './calibration-completion';
import { addLessonEvidence, lockCalibration } from './lesson-evidence';
import { evaluatePendingFeedback, linkFeedback } from './lesson-feedback';
import {
  CalibrationStatus,
  dayOf,
  isCalibrationClosed,
  focusDrivers,
  statusAfterEvaluation,
} from './calibration-rules';
import { loadActivePolicy } from './confidence-policy';
import { lessonGate, settleCalibration } from './lesson-gate';

const LEASE_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Answers = Record<string, string>;

/** Annulla la transazione quando il round non è più di questa richiesta. */
class RoundNotOwned extends Error {}

/**
 * Calibrazione gratuita dopo la prima valutazione: round di domande scritte
 * dall'AI sui driver meno affidabili, nuova valutazione a ogni round, chiusura
 * solo quando la regola di consolidamento è soddisfatta. Nessuna attesa fra i
 * round (PF-FS-PREPAYWALL §4.3): resta solo il lease tecnico per atleta.
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
    const [settings, policy] = await Promise.all([
      loadCalibrationSettings(this.prisma),
      loadActivePolicy(this.prisma, 'R_CONSOLIDATION'),
    ]);
    const evaluation = {
      overallConfidence: first.overallConfidence,
      levelConfidence: first.levelConfidence,
      drivers: first.areas,
    };
    const next = statusAfterEvaluation(
      'FREE_CALIBRATING',
      evaluation,
      settings,
      policy,
      await lessonGate(this.prisma, userId, evaluation),
    );
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.athleteCalibration.createMany({
        data: [
          {
            userId,
            startedAt: first.createdAt,
            deadlineAt: new Date(
              first.createdAt.getTime() + settings.maxDays * DAY_MS,
            ),
            status: next.completionReason ? 'FREE_CALIBRATING' : next.status,
            levelEstimatedAt: next.levelEstimated ? first.createdAt : null,
          },
        ],
        skipDuplicates: true,
      });
      if (!created.count) return;
      // Prima valutazione che soddisfa già la regola: si chiude e si consolida subito.
      if (next.completionReason)
        await completeCalibration(
          tx,
          userId,
          next.completionReason,
          first.createdAt,
          policy.id,
        );
      else
        await tx.assessmentEvaluation.update({
          where: { id: first.id },
          data: { consolidationPolicyId: policy.id },
        });
    });
    return this.prisma.athleteCalibration.findUnique({ where: { userId } });
  }

  /**
   * Stato mostrato all'atleta: round aperto senza punteggi. Il giorno della
   * fase gratuita è solo informativo: la scadenza non chiude R.
   */
  async view(userId: string, now = new Date()) {
    const calibration = await this.ensureStarted(userId);
    if (!calibration) return null;
    const [policy, open, evaluations] = await Promise.all([
      loadActivePolicy(this.prisma, 'R_CONSOLIDATION'),
      this.prisma.calibrationRound.findFirst({
        where: { userId, status: { in: ['OPEN', 'EVALUATING'] } },
        orderBy: { sequence: 'desc' },
      }),
      this.prisma.calibrationRound.count({
        where: { userId, status: 'EVALUATED' },
      }),
    ]);
    const completed = isCalibrationClosed(calibration.status);
    return {
      status: calibration.status as CalibrationStatus,
      startedAt: calibration.startedAt,
      day: dayOf(calibration.startedAt, now),
      consolidationRule: {
        version: policy.version,
        minOverallConfidence: policy.minOverallConfidence,
        minAreaConfidence: policy.minAreaConfidence,
        minAreasAtConfidence: policy.minAreasAtConfidence,
      },
      completedAt: calibration.completedAt,
      completionReason: calibration.completionReason,
      roundsCompleted: evaluations,
      // Il prossimo round è sempre disponibile finché R non è consolidata.
      nextRoundKind: completed ? null : ('ADAPTIVE' as const),
      round: open
        ? {
            id: open.id,
            kind: open.kind,
            // Una domanda, un gruppo o un chiarimento: il motivo resta interno.
            action: open.action,
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
    if (isCalibrationClosed(calibration.status))
      throw new ConflictException('La calibrazione è già completata');
    await requireAiConsent(this.prisma, userId);
    const lease = await this.claim(userId);
    try {
      const rounds = await this.prisma.calibrationRound.findMany({
        where: { userId },
        orderBy: { sequence: 'asc' },
      });
      // Un round già aperto vale per tutte le richieste concorrenti.
      if (rounds.some((r) => r.status === 'OPEN' || r.status === 'EVALUATING'))
        return;
      // Il feedback del coach non ancora valutato passa prima di nuove domande.
      if (await this.evaluatePendingFeedback(userId)) return;
      const latest = await this.prisma.assessmentEvaluation.findFirstOrThrow({
        where: { userId },
        orderBy: { sequence: 'desc' },
        include: { areas: { include: { area: { select: { name: true } } } } },
      });
      const kind = 'ADAPTIVE' as const;
      const policy = await loadActivePolicy(this.prisma, 'R_CONSOLIDATION');
      const drivers = latest.areas.map((a) => ({
        areaId: a.areaId,
        name: a.area.name,
        score: a.score,
        confidence: a.confidence,
        evidenceGaps: a.evidenceGaps as string[],
      }));
      const focus = focusDrivers(
        { overallConfidence: latest.overallConfidence, drivers },
        policy,
      );
      // La valutazione corrente soddisfa la regola in vigore (per esempio
      // abbassata dal back office): si consolida senza nuove domande.
      if (!focus.length) {
        const { gate, completed } = await this.prisma.$transaction(
          async (tx) => {
            await lockCalibration(tx, userId);
            return settleCalibration(tx, userId, now);
          },
        );
        if (completed) return;
        if (gate.pending)
          throw new ConflictException({
            code: 'CALIBRATION_WAITING_LESSON',
            message:
              'La tua R si chiude dopo la lezione con il coach del circolo.',
          });
        if (gate.available)
          throw new ConflictException({
            code: 'CALIBRATION_LESSON_CHOICE',
            message:
              'La tua R si chiude con la lezione gratuita al circolo: richiedila, oppure dicci che preferisci non farla.',
          });
        return;
      }
      const asked = await this.askedQuestions(userId, rounds);
      const prompt = await loadActiveAssessmentPrompt(
        this.prisma,
        'CALIBRATION',
      );
      const input = await this.evaluationInput(
        userId,
        rounds.filter((r) => r.status === 'EVALUATED'),
      );
      // L'AI vede tutti i driver e sceglie azione e domande su quelli in focus.
      const inFocus = new Set(focus.map((d) => d.areaId));
      const result = await this.ai.generateCalibrationQuestions({
        basePrompt: prompt.basePrompt,
        promptVersionId: prompt.promptVersionId,
        scale: input.scale,
        athleteContext: input.athleteContext,
        targets: drivers.map((d) => ({
          ...d,
          askedQuestions: asked.get(d.areaId) ?? [],
          focus: inFocus.has(d.areaId),
        })),
      });
      await this.prisma.calibrationRound.create({
        data: {
          userId,
          sequence: (rounds.at(-1)?.sequence ?? 0) + 1,
          kind,
          questionsJson: result.questions as unknown as Prisma.InputJsonValue,
          action: result.action,
          targetAreas: result.targetAreas,
          rationale: result.rationale,
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

  /**
   * Salva le risposte del round e rivaluta R e confidence di tutti i driver.
   * Le risposte si fissano una sola volta, nel passaggio OPEN → EVALUATING; chi
   * riprende un round già in valutazione (lease scaduto) valuta quelle salvate.
   */
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
    if (round.status === 'EXPIRED')
      throw new ConflictException('La calibrazione è scaduta');
    const questions = round.questionsJson as CalibrationQuestion[];
    const invalid = questions.some(
      (q) => !q.options.some((o) => o.value === answers[q.id]),
    );
    if (invalid || Object.keys(answers).length !== questions.length)
      throw new BadRequestException('Rispondi a tutte le domande del round');
    await requireAiConsent(this.prisma, userId);
    const lease = await this.claim(userId);
    try {
      const token = randomUUID();
      const fixed = await this.prisma.calibrationRound.updateMany({
        where: { id: roundId, status: 'OPEN' },
        data: {
          status: 'EVALUATING',
          answersJson: answers,
          answeredAt: now,
          evaluationToken: token,
        },
      });
      // Già in valutazione: si prende in carico senza toccare le risposte.
      const owned =
        fixed.count ||
        (
          await this.prisma.calibrationRound.updateMany({
            where: { id: roundId, status: 'EVALUATING' },
            data: { evaluationToken: token },
          })
        ).count;
      if (!owned) return;
      try {
        await this.evaluateRound(userId, roundId, token);
      } catch (error) {
        // Il round è passato a un'altra richiesta: vale il suo esito.
        if (error instanceof RoundNotOwned) return;
        // Solo il proprietario riapre il round; le risposte restano per riprovare.
        await this.prisma.calibrationRound.updateMany({
          where: { id: roundId, status: 'EVALUATING', evaluationToken: token },
          data: { status: 'OPEN', evaluationToken: null },
        });
        throw error;
      }
    } finally {
      await this.release(userId, lease);
    }
  }

  private async evaluateRound(userId: string, roundId: string, token: string) {
    const rounds = await this.prisma.calibrationRound.findMany({
      where: { userId },
      orderBy: { sequence: 'asc' },
    });
    const round = rounds.find((r) => r.id === roundId)!;
    const input = await this.evaluationInput(
      userId,
      rounds.filter((r) => r.status === 'EVALUATED' || r.id === roundId),
    );
    const feedbackIds = await addLessonEvidence(this.prisma, userId, input);
    const result = await this.ai.evaluateAssessment(input);
    const [settings, policy] = await Promise.all([
      loadCalibrationSettings(this.prisma),
      loadActivePolicy(this.prisma, 'R_CONSOLIDATION'),
    ]);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Lock della riga: un posto assegnato in questo momento sospende la chiusura.
      await lockCalibration(tx, userId);
      const calibration = await tx.athleteCalibration.findUniqueOrThrow({
        where: { userId },
      });
      // Chiusa nel frattempo: nessuna valutazione oltre quella consolidata.
      if (isCalibrationClosed(calibration.status)) throw new RoundNotOwned();
      const last = await tx.assessmentEvaluation.findFirstOrThrow({
        where: { userId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const saved = await saveEvaluation(tx, userId, input, result, {
        sequence: last.sequence + 1,
        source:
          round.kind === 'CLOSING' ? 'CLOSING_ASSESSMENT' : 'CALIBRATION_ROUND',
        consolidationPolicyId: policy.id,
      });
      // Collega solo il proprietario attuale: chi ha perso il round annulla tutto.
      const linked = await tx.calibrationRound.updateMany({
        where: { id: roundId, status: 'EVALUATING', evaluationToken: token },
        data: {
          status: 'EVALUATED',
          evaluationId: saved.id,
          evaluatedAt: now,
          evaluationToken: null,
        },
      });
      if (!linked.count) throw new RoundNotOwned();
      await linkFeedback(tx, feedbackIds, saved.id);
      const next = statusAfterEvaluation(
        calibration.status as CalibrationStatus,
        result.output,
        settings,
        policy,
        await lessonGate(tx, userId, result.output),
      );
      if (next.completionReason)
        await completeCalibration(
          tx,
          userId,
          next.completionReason,
          now,
          policy.id,
        );
      else
        await tx.athleteCalibration.update({
          where: { userId },
          data: {
            status: next.status,
            ...(next.levelEstimated ? { levelEstimatedAt: now } : {}),
          },
        });
    });
  }

  /**
   * Valuta il feedback del coach appena arrivato, senza aspettare un round:
   * è la fonte che la lezione gratuita deve far pesare su R prima della
   * chiusura. Se l'atleta ha un'operazione in corso si riprova al prossimo
   * round; l'attesa della lezione resta finché il feedback non è valutato.
   */
  async evaluateLessonFeedback(userId: string) {
    const lease = await this.tryClaim(userId);
    if (!lease) return false;
    try {
      await requireAiConsent(this.prisma, userId);
      return await this.evaluatePendingFeedback(userId);
    } finally {
      await this.release(userId, lease);
    }
  }

  /**
   * Storia dell'atleta come la vede la valutazione: primo set, round valutati,
   * micro-test e feedback del coach, ciascuno con la sua fonte. Sola lettura.
   */
  async athleteHistory(userId: string) {
    const rounds = await this.prisma.calibrationRound.findMany({
      where: { userId, status: 'EVALUATED' },
      orderBy: { sequence: 'asc' },
    });
    const input = await this.evaluationInput(userId, rounds);
    await addLessonEvidence(this.prisma, userId, input);
    return input;
  }

  /** Va chiamata sotto il lease dell'atleta. */
  private evaluatePendingFeedback(userId: string) {
    return evaluatePendingFeedback(this.prisma, this.ai, userId, (rounds) =>
      this.evaluationInput(userId, rounds),
    );
  }

  /**
   * Input completo per la rivalutazione: primo set, risposte dei round passati
   * (valutati più quello in valutazione), stima precedente per driver.
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
        include: { areas: { include: { area: { select: { name: true } } } } },
      }),
    ]);
    // I driver sono quelli dell'ultima valutazione, anche senza anamnesi.
    const input = await buildAssessmentEvaluationInput(
      this.prisma,
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

  /** Una sola operazione AI alla volta per atleta; un lease scaduto si riprende. */
  private async claim(userId: string) {
    const lease = await this.tryClaim(userId);
    if (!lease)
      throw new ConflictException(
        'Elaborazione già in corso. Attendi e riprendi il percorso.',
      );
    return lease;
  }

  private async tryClaim(userId: string) {
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
    return claimed.count ? lease : null;
  }

  /** Rilascia solo il proprio lease: uno scaduto e ripreso da altri resta loro. */
  private async release(userId: string, lease: Date) {
    await this.prisma.athleteCalibration.updateMany({
      where: { userId, operationAt: lease },
      data: { operationAt: null },
    });
  }
}
