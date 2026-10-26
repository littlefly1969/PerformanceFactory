import { performanceDriverName as driverName } from '../performance/performance-display';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentsService } from '../consents/consents.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { loadSpecialistQuestionRecords } from '../onboarding/onboarding-questions';
import { discoveryContext } from './discovery-context';
import {
  dropStaleBank,
  generateInitialQuestionBank,
} from './initial-question-bank';
import {
  estimatedMinutes,
  logAssessmentProblems,
  loadAssessmentConfiguration,
  loadOperationalTemplates,
  saveOperationalAnswer,
  assessmentConfigurationError,
} from './assessment-configuration';
import {
  OnboardingAnswer,
  TemplateRecord,
} from '../onboarding/onboarding-model';
import { normalizeOptions } from '../onboarding/onboarding-answers';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import {
  loadAssessmentEvaluation,
  runAssessmentEvaluation,
} from './assessment-evaluation';
import { CalibrationService } from './calibration/calibration.service';
import { ScenariosService } from './scenarios/scenarios.service';

import {
  PROGRAM_DURATIONS,
  PROGRAM_HORIZON_WEEKS,
  horizonForWeeks,
} from './program-horizon';
import {
  entitledHorizon,
  hasProgramEntitlement,
} from './calibration/calibration-config';
import type { ProvidedBaseline } from '../onboarding/onboarding-assessment';
import { recordMeaningfulInteraction } from '../engagement/meaningful-interaction';
import { pendingWakeup } from '../engagement/engagement.service';
import { baselineValue, chosenOptions, roundAnswers } from './choice-answers';
import {
  alignBest,
  fitRankingFromAnswers,
  fitRankingQuestions,
  isFitQuestion,
  saveFitRanking,
  validFitAnswer,
} from './fit-ranking/fit-ranking';
const LEASE_MS = 10 * 60 * 1000;
/** Prova mostrata all'atleta: solo visualizzazione, nessun blocco a scadenza. */
const TRIAL_DAYS = 7;
const actor = (id: string) => ({ id, role: 'USER' as const });

@Injectable()
export class AthleteJourneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentsService,
    private readonly onboarding: OnboardingService,
    private readonly ai: AiProposalProviderService,
    private readonly calibration: CalibrationService,
    private readonly scenarios: ScenariosService,
  ) {}

  async state(userId: string) {
    const saved = await this.record(userId);
    const consent = await this.consents.status(userId);
    if (consent.required)
      return {
        phase: 'CONSENTS',
        nextStep: 'CONSENTS',
        documents: consent.documents,
      };
    const [operational, bank, user, wakeup] = await Promise.all([
      loadOperationalTemplates(this.prisma),
      loadSpecialistQuestionRecords(this.prisma, userId),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { firstName: true, createdAt: true },
      }),
      pendingWakeup(this.prisma, userId),
    ]);
    // Avviato: le domande dei driver arrivano dopo la classifica FIT.
    const started = bank.length > 0 || saved.phase === 'ASSESSMENT';
    const answers = saved.assessmentAnswers as Record<
      string,
      OnboardingAnswer['value']
    >;
    const ranking = fitRankingQuestions(answers);
    // Finché le domande dei driver non ci sono vale la configurazione; poi la banca.
    const config = bank.length
      ? null
      : await loadAssessmentConfiguration(this.prisma, userId);
    if (config?.problems.length) logAssessmentProblems(config.problems);
    const questions = started ? [...operational, ...ranking, ...bank] : [];
    const drivers = bank.length
      ? [...new Set(bank.map((q) => q.areaId!))].map((id) => {
          const area = bank.find((q) => q.areaId === id)!.area!;
          return {
            id,
            name: area.name,
            count: bank.filter((q) => q.areaId === id).length,
          };
        })
      : config!.areas.map((a) => ({
          id: a.id,
          name: a.name,
          count: config!.perArea,
        }));
    const orderedAreas = drivers.map((d) => d.id);
    const driverList = drivers.map((d) => ({ ...d, name: driverName(d.name) }));
    const count = bank.length
      ? questions.length
      : config!.count + ranking.length;
    const fixedCount = operational.length + ranking.length;
    const processing =
      saved.operationAt && Date.now() - saved.operationAt.getTime() < LEASE_MS;
    const evaluation = started
      ? await loadAssessmentEvaluation(this.prisma, userId, orderedAreas)
      : null;
    // La calibrazione gratuita parte dalla prima valutazione (A4.3).
    const calibration =
      evaluation && !saved.baselineId
        ? await this.calibration.view(userId)
        : null;
    // P3/P6/P12 solo a calibrazione chiusa e con la funzione attiva (A3.9).
    const scenarios = calibration
      ? await this.scenarios.view(userId, orderedAreas)
      : null;
    // Abbonato con l'orizzonte scelto: il prossimo passo è il programma.
    const subscribed =
      calibration?.status === 'PAYWALL_READY' &&
      (await hasProgramEntitlement(this.prisma, userId));
    const phase = saved.baselineId
      ? saved.programDurationWeeks
        ? 'COMPLETE'
        : saved.phase === 'DURATION'
          ? 'DURATION'
          : 'RESULT'
      : subscribed
        ? 'SUBSCRIBED'
        : evaluation
          ? 'EVALUATION'
          : processing
            ? 'PROCESSING'
            : started
              ? 'ASSESSMENT'
              : config!.problems.length
                ? 'ASSESSMENT_UNAVAILABLE'
                : 'ASSESSMENT_INTRO';
    const snapshot = saved.baselineId
      ? await this.prisma.performanceProfileSnapshot.findFirst({
          where: { id: saved.baselineId, userId },
          include: { areas: { include: { area: true } } },
        })
      : null;
    const results =
      snapshot?.areas.map((a) => ({
        id: a.areaId,
        name: driverName(a.area.name),
        current: a.realR,
      })) ?? [];
    const position = (id: string) => {
      const index = orderedAreas.indexOf(id);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    results.sort((a, b) => position(a.id) - position(b.id));
    // Priorità dal driver più basso: il gap verso P non è esposto all'atleta.
    const priority = [...results].sort((a, b) => a.current - b.current)[0];
    return {
      phase,
      nextStep: phase,
      firstName: user.firstName,
      // Bentornato dopo 10 giorni: riprende dal profilo esistente (§8.4).
      wakeup,
      trial: {
        days: TRIAL_DAYS,
        daysLeft: Math.max(
          0,
          TRIAL_DAYS -
            Math.floor((Date.now() - user.createdAt.getTime()) / 86400000),
        ),
      },
      currentQuestion: Math.min(saved.currentQuestion, questions.length),
      // Tutte le risposte date: l'atleta può correggerle fino alla valutazione AI.
      assessmentComplete:
        bank.length > 0 && saved.currentQuestion >= questions.length,
      // Finite disponibilità e classifica: l'AI scrive le domande dei driver.
      questionsPending:
        started && !bank.length && saved.currentQuestion >= fixedCount,
      evaluation,
      calibration,
      scenarios,
      answers,
      questions: questions.map((q) => ({
        id: q.id,
        kind: q.areaId
          ? 'AREA'
          : isFitQuestion(q.id)
            ? 'RANKING'
            : 'OPERATIONAL',
        section: q.area
          ? driverName(q.area.name)
          : isFitQuestion(q.id)
            ? 'Classifica FIT'
            : 'Disponibilità',
        title: q.label,
        areaId: q.areaId,
        areaName: q.area ? driverName(q.area.name) : null,
        options: normalizeOptions(q.optionsJson),
        required: q.required,
        inputType: q.inputType,
        multiple: q.multiple ?? false,
      })),
      fixedQuestionCount: fixedCount,
      areaQuestionCount: bank.length || config!.areaQuestionCount,
      count,
      driverList,
      estimatedMinutes: estimatedMinutes(count),
      result: snapshot
        ? {
            snapshotId: snapshot.id,
            current: snapshot.rankingGlobal,
            drivers: results,
            priority,
          }
        : null,
      durationOptions: PROGRAM_DURATIONS,
      programDurationWeeks: saved.programDurationWeeks,
      programHorizon: saved.programHorizon,
    };
  }

  async start(userId: string) {
    await this.allowed(userId);
    const saved = await this.record(userId);
    if (saved.baselineId || saved.phase === 'ASSESSMENT')
      return this.state(userId);
    // Configurazione invalida: l'avvio si ferma, nessuna domanda di riserva.
    const config = await loadAssessmentConfiguration(this.prisma, userId);
    if (config.problems.length)
      throw assessmentConfigurationError(config.problems);
    await this.prisma.athleteDiscovery.updateMany({
      where: { userId, phase: { not: 'ASSESSMENT' }, baselineId: null },
      data: { phase: 'ASSESSMENT', currentQuestion: 0 },
    });
    return this.state(userId);
  }

  /**
   * Dopo disponibilità e classifica FIT l'AI scrive le domande dei driver, in
   * un solo lotto. Se non risponde l'atleta riprova: nessuna riserva.
   */
  async prepareQuestions(userId: string) {
    await this.allowed(userId);
    await this.claim(userId);
    try {
      await generateInitialQuestionBank(this.prisma, this.ai, userId);
    } finally {
      await this.release(userId);
    }
    return this.state(userId);
  }

  async answer(userId: string, questionId: string, value: unknown) {
    await this.allowed(userId);
    const questions = await this.sequence(userId);
    const index = questions.findIndex((q) => q.id === questionId);
    if (index < 0 || !this.valid(questions[index], value))
      throw new BadRequestException('Risposta non valida');
    const fit = isFitQuestion(questionId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const saved = await tx.athleteDiscovery.findUniqueOrThrow({
        where: { userId },
      });
      if (
        saved.baselineId ||
        saved.operationAt ||
        (await tx.assessmentEvaluation.count({ where: { userId } }))
      )
        throw new ConflictException('Assessment già inviato o in elaborazione');
      if (index !== saved.currentQuestion)
        throw new ConflictException(
          'La domanda è cambiata. Riprendi il percorso.',
        );
      let answers: Record<string, unknown> = {
        ...(saved.assessmentAnswers as object),
        [questionId]: value,
      };
      if (fit) {
        answers = alignBest(answers);
        // Classifica cambiata: le domande dei driver vanno riscritte.
        answers = await dropStaleBank(tx, userId, saved, answers, questions);
      }
      await tx.athleteDiscovery.update({
        where: { userId },
        data: {
          assessmentAnswers: answers as Prisma.InputJsonValue,
          currentQuestion: index + 1,
        },
      });
      // La classifica completa entra subito nello storico e nel profilo.
      const ranking = fit ? fitRankingFromAnswers(answers) : null;
      if (ranking) await saveFitRanking(tx, userId, ranking, 'JOURNEY');
      // Le risposte operative vanno subito nel profilo letto dal training.
      else if (!fit && !questions[index].areaId)
        await saveOperationalAnswer(tx, userId, questions[index], value);
      await recordMeaningfulInteraction(tx, userId, 'ASSESSMENT_ANSWER');
    });
    return this.state(userId);
  }

  async back(userId: string) {
    await this.allowed(userId);
    const saved = await this.record(userId);
    if (
      saved.baselineId ||
      saved.operationAt ||
      (await this.prisma.assessmentEvaluation.count({ where: { userId } }))
    )
      throw new ConflictException('Assessment già inviato o in elaborazione');
    await this.prisma.athleteDiscovery.updateMany({
      where: {
        userId,
        currentQuestion: saved.currentQuestion,
        operationAt: null,
        baselineId: null,
      },
      data: { currentQuestion: Math.max(0, saved.currentQuestion - 1) },
    });
    return this.state(userId);
  }

  /** Prima valutazione AI delle risposte: R provvisoria per driver, una sola volta. */
  async evaluate(userId: string) {
    await this.allowed(userId);
    const saved = await this.record(userId);
    if (
      saved.baselineId ||
      (await this.prisma.assessmentEvaluation.count({ where: { userId } }))
    )
      return this.state(userId);
    const claimed = await this.claim(userId);
    try {
      if (
        !(await this.prisma.assessmentEvaluation.count({ where: { userId } }))
      ) {
        const questions = await this.sequence(userId);
        const stored = claimed.assessmentAnswers as Record<string, unknown>;
        if (
          !questions.some((q) => q.areaId) ||
          questions.some((q) => !this.valid(q, stored[q.id]))
        )
          throw new BadRequestException('Completa tutte le domande');
        const { areas } = await loadAssessmentConfiguration(
          this.prisma,
          userId,
        );
        await runAssessmentEvaluation(
          this.prisma,
          this.ai,
          userId,
          questions.filter((q) => !isFitQuestion(q.id)),
          stored,
          areas,
        );
      }
    } finally {
      await this.release(userId);
    }
    return this.state(userId);
  }

  async horizon(userId: string, horizon: unknown) {
    await this.allowed(userId);
    await this.scenarios.select(userId, horizon);
    return this.state(userId);
  }

  async paywallViewed(userId: string) {
    await this.allowed(userId);
    await this.scenarios.paywallViewed(userId);
    return { recorded: true };
  }

  async calibrationRound(userId: string) {
    await this.allowed(userId);
    await this.calibration.openRound(userId);
    return this.state(userId);
  }

  async calibrationSkip(userId: string, roundId: string) {
    await this.allowed(userId);
    await this.calibration.skipMicroTest(userId, roundId);
    return this.state(userId);
  }

  async calibrationAnswers(
    userId: string,
    roundId: string,
    answers: Record<string, unknown>,
  ) {
    await this.allowed(userId);
    await this.calibration.answerRound(userId, roundId, roundAnswers(answers));
    return this.state(userId);
  }

  async submit(userId: string, revisedGoal?: string) {
    await this.allowed(userId);
    const saved = await this.record(userId);
    if (saved.baselineId) return this.state(userId);
    await this.submitAnswers(userId, revisedGoal);
    return this.state(userId);
  }

  /**
   * Dopo il pagamento (A4 SUBSCRIBED_ACTIVE): il programma parte dalla R
   * consolidata e dalla P dell'orizzonte pagato, non dallo scoring delle
   * risposte, e la durata è quella dell'orizzonte, senza chiederla di nuovo.
   */
  async program(userId: string) {
    await this.allowed(userId);
    const saved = await this.record(userId);
    if (saved.baselineId) return this.state(userId);
    const calibration = await this.prisma.athleteCalibration.findUnique({
      where: { userId },
      select: { status: true },
    });
    // L'orizzonte del programma è quello dell'abbonamento pagato.
    const horizon = await entitledHorizon(this.prisma, userId);
    if (calibration?.status !== 'PAYWALL_READY' || !horizon)
      throw new ConflictException(
        'Il programma si sblocca dopo la scelta del percorso e l’abbonamento.',
      );
    const baseline = await this.scenarios.programBaseline(userId, horizon);
    if (!baseline?.areas.length)
      throw new ConflictException('I tuoi scenari non sono ancora pronti.');
    await this.submitAnswers(userId, undefined, {
      reason: `Baseline da R consolidata, orizzonte ${baseline.horizon}`,
      areas: baseline.areas,
    });
    const weeks = PROGRAM_HORIZON_WEEKS[baseline.horizon];
    await this.prisma.$transaction(async (tx) => {
      await tx.athleteDiscovery.update({
        where: { userId },
        data: {
          phase: 'COMPLETE',
          programHorizon: baseline.horizon,
          programDurationWeeks: weeks,
          durationSelectedAt: new Date(),
        },
      });
      const assessment = await tx.userOnboardingAssessment.findUniqueOrThrow({
        where: { userId },
      });
      await tx.userOnboardingAssessment.update({
        where: { userId },
        data: {
          profileJson: {
            ...((assessment.profileJson as Prisma.JsonObject) ?? {}),
            program_duration_weeks: {
              label: 'Durata del programma in settimane',
              value: weeks,
            },
          },
        },
      });
    });
    return this.state(userId);
  }

  /** Obiettivo validato e baseline creata sotto lease, con tutte le risposte. */
  private async submitAnswers(
    userId: string,
    revisedGoal?: string,
    baseline?: ProvidedBaseline,
  ) {
    const claimed = await this.claim(userId);
    try {
      // La classifica non è una risposta dell'onboarding: vive nel suo storico.
      const questions = (await this.sequence(userId)).filter(
        (q) => !isFitQuestion(q.id),
      );
      const stored = claimed.assessmentAnswers as Record<string, unknown>;
      if (
        !questions.some((q) => q.areaId) ||
        questions.some((q) => !this.valid(q, stored[q.id]))
      )
        throw new BadRequestException('Completa tutte le domande');
      const general = await discoveryContext(this.prisma, userId);
      const answers: OnboardingAnswer[] = [
        ...general!.answers,
        ...questions.map((q) => ({
          questionId: q.id,
          value: baselineValue(q, stored[q.id]),
        })),
      ];
      const goal = revisedGoal?.trim() || (await this.goal(userId));
      await this.onboarding.validateFinalGoal(actor(userId), goal, answers);
      await this.onboarding.submit(actor(userId), goal, answers, baseline);
    } finally {
      await this.release(userId);
    }
  }

  async duration(userId: string, weeks?: number) {
    await this.allowed(userId);
    const saved = await this.record(userId);
    if (!saved.baselineId)
      throw new ConflictException('Completa prima il tuo assessment');
    if (
      weeks !== undefined &&
      !PROGRAM_DURATIONS.some((d) => d.weeks === weeks)
    )
      throw new BadRequestException('Durata non valida');
    await this.prisma.$transaction(async (tx) => {
      await tx.athleteDiscovery.update({
        where: { userId },
        data:
          weeks === undefined
            ? { phase: 'DURATION' }
            : {
                phase: 'COMPLETE',
                programDurationWeeks: weeks,
                programHorizon: horizonForWeeks(weeks),
                durationSelectedAt: new Date(),
              },
      });
      if (weeks !== undefined) {
        // Existing program-generation services consume this profile as athlete context.
        const assessment = await tx.userOnboardingAssessment.findUniqueOrThrow({
          where: { userId },
        });
        await tx.userOnboardingAssessment.update({
          where: { userId },
          data: {
            profileJson: {
              ...((assessment.profileJson as Prisma.JsonObject) ?? {}),
              program_duration_weeks: {
                label: 'Durata del programma in settimane',
                value: weeks,
              },
            },
          },
        });
      }
    });
    return this.state(userId);
  }

  /**
   * Operative per prime, poi la classifica FIT, poi la banca di area; vuota
   * finché l'assessment non parte.
   */
  private async sequence(userId: string) {
    const bank = await loadSpecialistQuestionRecords(this.prisma, userId);
    const saved = await this.record(userId);
    if (!bank.length && saved.phase !== 'ASSESSMENT') return [];
    return [
      ...(await loadOperationalTemplates(this.prisma)),
      ...fitRankingQuestions(
        saved.assessmentAnswers as Record<string, unknown>,
      ),
      ...bank,
    ];
  }
  private valid(q: TemplateRecord, value: unknown) {
    if (isFitQuestion(q.id)) return validFitAnswer(q, value);
    const options = normalizeOptions(q.optionsJson) as { value: unknown }[];
    return chosenOptions(options, value, q.multiple) !== null;
  }
  private async allowed(userId: string) {
    // A crashed worker must not leave the athlete unable to edit/retry forever.
    await this.prisma.athleteDiscovery.updateMany({
      where: {
        userId,
        baselineId: null,
        operationAt: { lt: new Date(Date.now() - LEASE_MS) },
      },
      data: { operationAt: null },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });
    if (user?.role !== 'USER' || !user.isActive)
      throw new ForbiddenException('Percorso riservato agli atleti attivi');
    if ((await this.consents.status(userId)).required)
      throw new ForbiddenException('Accetta prima i consensi correnti');
  }
  private async record(userId: string) {
    const saved = await this.prisma.athleteDiscovery.findUnique({
      where: { userId },
    });
    if (!saved) throw new NotFoundException('Percorso discovery non trovato');
    return saved;
  }
  private async goal(userId: string) {
    return (
      await this.prisma.userPerformanceGoal.findUniqueOrThrow({
        where: { userId },
      })
    ).goalText;
  }
  private async claim(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize claiming with answer writes, then read the answers under the lease.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const result = await tx.athleteDiscovery.updateMany({
        where: {
          userId,
          baselineId: null,
          OR: [
            { operationAt: null },
            { operationAt: { lt: new Date(Date.now() - LEASE_MS) } },
          ],
        },
        data: { operationAt: new Date() },
      });
      if (!result.count)
        throw new ConflictException(
          'Elaborazione già in corso. Attendi e riprendi il percorso.',
        );
      return tx.athleteDiscovery.findUniqueOrThrow({ where: { userId } });
    });
  }
  private async release(userId: string) {
    await this.prisma.athleteDiscovery.update({
      where: { userId },
      data: { operationAt: null },
    });
  }
}
