import { performanceDriverName as driverName } from '../performance/performance-display';
import { requireSportContext } from '../onboarding/onboarding-sports';
import { QUESTIONS_PER_AREA } from '../ai-orchestrator/proposal-provider-model';
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
import { configuredAssessment } from './configured-assessment';
import {
  OnboardingAnswer,
  TemplateRecord,
} from '../onboarding/onboarding-model';
import { normalizeOptions } from '../onboarding/onboarding-answers';

export const PROGRAM_DURATIONS = [
  {
    weeks: 4,
    label: '4 settimane',
    description: 'Un primo blocco per costruire continuità.',
  },
  {
    weeks: 12,
    label: '12 settimane',
    description: 'Un ciclo completo per lavorare sui tuoi driver.',
  },
  { weeks: 52, label: '12 mesi', description: 'Un percorso di lungo periodo.' },
];
const LEASE_MS = 10 * 60 * 1000;
const actor = (id: string) => ({ id, role: 'USER' as const });

@Injectable()
export class AthleteJourneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentsService,
    private readonly onboarding: OnboardingService,
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
    const questions = await loadSpecialistQuestionRecords(this.prisma, userId);
    const context = await requireSportContext(this.prisma, userId);
    const configured = questions.length
      ? []
      : await this.prisma.onboardingQuestionTemplate.findMany({
          where: {
            scope: 'AREA',
            isActive: true,
            areaId: { in: context.areas.map((a) => a.id) },
            optionsJson: {
              path: ['sportKey'],
              equals: context.selection.sportKey,
            },
          },
        });
    configured.sort((a, b) => a.orderIndex - b.orderIndex);
    const orderedAreas = [
      ...new Set(
        (questions.length ? questions : configured).map((q) => q.areaId),
      ),
    ];
    context.areas.sort(
      (a, b) => orderedAreas.indexOf(a.id) - orderedAreas.indexOf(b.id),
    );
    const count =
      questions.length ||
      configured.length ||
      context.areas.length * QUESTIONS_PER_AREA;
    const driverList = context.areas.map((a) => ({
      ...a,
      name: driverName(a.name),
      count: questions.length
        ? questions.filter((q) => q.areaId === a.id).length
        : configured.length
          ? configured.filter((q) => q.areaId === a.id).length
          : QUESTIONS_PER_AREA,
    }));
    const answers = saved.assessmentAnswers as Record<
      string,
      OnboardingAnswer['value']
    >;
    const processing =
      saved.operationAt && Date.now() - saved.operationAt.getTime() < LEASE_MS;
    const phase = saved.baselineId
      ? saved.programDurationWeeks
        ? 'COMPLETE'
        : saved.phase === 'DURATION'
          ? 'DURATION'
          : 'RESULT'
      : processing
        ? 'PROCESSING'
        : questions.length
          ? 'ASSESSMENT'
          : 'ASSESSMENT_INTRO';
    const snapshot = saved.baselineId
      ? await this.prisma.performanceProfileSnapshot.findFirst({
          where: { id: saved.baselineId, userId },
          include: { areas: { include: { area: true } } },
        })
      : null;
    const drivers =
      snapshot?.areas.map((a) => ({
        id: a.areaId,
        name: driverName(a.area.name),
        current: a.realR,
        potential: a.potentialP,
        gap: a.potentialP - a.realR,
      })) ?? [];
    drivers.sort(
      (a, b) => orderedAreas.indexOf(a.id) - orderedAreas.indexOf(b.id),
    );
    const potential = drivers.length
      ? Math.round(
          drivers.reduce((sum, d) => sum + d.potential, 0) / drivers.length,
        )
      : 0;
    const priority = [...drivers].sort(
      (a, b) => b.gap - a.gap || a.current - b.current,
    )[0];
    return {
      phase,
      nextStep: phase,
      currentQuestion: Math.min(saved.currentQuestion, questions.length),
      answers,
      questions: questions.map((q) => ({
        id: q.id,
        title: q.label,
        areaId: q.areaId,
        areaName: q.area ? driverName(q.area.name) : null,
        options: normalizeOptions(q.optionsJson),
        required: q.required,
        inputType: q.inputType,
      })),
      count,
      driverList,
      estimatedMinutes: Math.max(1, Math.ceil(count / 3)),
      result: snapshot
        ? {
            snapshotId: snapshot.id,
            current: snapshot.rankingGlobal,
            potential,
            gap: potential - snapshot.rankingGlobal,
            drivers,
            priority,
          }
        : null,
      durationOptions: PROGRAM_DURATIONS,
      programDurationWeeks: saved.programDurationWeeks,
    };
  }

  async start(userId: string) {
    await this.allowed(userId);
    const saved = await this.record(userId);
    if (
      saved.baselineId ||
      (await this.prisma.userOnboardingQuestion.count({ where: { userId } }))
    )
      return this.state(userId);
    await this.claim(userId);
    try {
      // A second start may have waited for the first to finish claiming work.
      if (
        !(await this.prisma.userOnboardingQuestion.count({ where: { userId } }))
      ) {
        if (!(await configuredAssessment(this.prisma, userId))) {
          const context = await discoveryContext(this.prisma, userId);
          await this.onboarding.generateSpecialistQuestions(
            actor(userId),
            await this.goal(userId),
            context!.answers,
          );
        }
        await this.prisma.athleteDiscovery.update({
          where: { userId },
          data: { phase: 'ASSESSMENT', currentQuestion: 0 },
        });
      }
    } finally {
      await this.release(userId);
    }
    return this.state(userId);
  }

  async answer(userId: string, questionId: string, value: unknown) {
    await this.allowed(userId);
    const questions = await loadSpecialistQuestionRecords(this.prisma, userId);
    const index = questions.findIndex((q) => q.id === questionId);
    if (index < 0 || !this.valid(questions[index], value))
      throw new BadRequestException('Risposta non valida');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const saved = await tx.athleteDiscovery.findUniqueOrThrow({
        where: { userId },
      });
      if (saved.baselineId || saved.operationAt)
        throw new ConflictException('Assessment già inviato o in elaborazione');
      if (index !== saved.currentQuestion)
        throw new ConflictException(
          'La domanda è cambiata. Riprendi il percorso.',
        );
      const answers = {
        ...(saved.assessmentAnswers as object),
        [questionId]: value,
      } as Prisma.InputJsonValue;
      await tx.athleteDiscovery.update({
        where: { userId },
        data: { assessmentAnswers: answers, currentQuestion: index + 1 },
      });
    });
    return this.state(userId);
  }

  async back(userId: string) {
    await this.allowed(userId);
    const saved = await this.record(userId);
    if (saved.baselineId || saved.operationAt)
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

  async submit(userId: string, revisedGoal?: string) {
    await this.allowed(userId);
    const saved = await this.record(userId);
    if (saved.baselineId) return this.state(userId);
    const claimed = await this.claim(userId);
    try {
      const questions = await loadSpecialistQuestionRecords(
        this.prisma,
        userId,
      );
      const stored = claimed.assessmentAnswers as Record<string, unknown>;
      if (
        !questions.length ||
        questions.some((q) => !this.valid(q, stored[q.id]))
      )
        throw new BadRequestException('Completa tutte le domande');
      const general = await discoveryContext(this.prisma, userId);
      const answers: OnboardingAnswer[] = [
        ...general!.answers,
        ...questions.map((q) => ({
          questionId: q.id,
          value: stored[q.id] as OnboardingAnswer['value'],
        })),
      ];
      const goal = revisedGoal?.trim() || (await this.goal(userId));
      await this.onboarding.validateFinalGoal(actor(userId), goal, answers);
      await this.onboarding.submit(actor(userId), goal, answers);
    } finally {
      await this.release(userId);
    }
    return this.state(userId);
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

  private valid(q: TemplateRecord, value: unknown) {
    const options = normalizeOptions(q.optionsJson) as { value: unknown }[];
    return (
      (typeof value === 'string' || typeof value === 'number') &&
      options.some((o) => String(o.value) === String(value))
    );
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
