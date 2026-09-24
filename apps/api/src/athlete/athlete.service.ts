import { profileValue } from '../ai-orchestrator/training-constraints';
import { CycleCompletionService } from '../cycle-completion/cycle-completion.service';
import { TrainingLifecycleOrchestrator } from '../training-lifecycle/training-lifecycle.orchestrator';
import { loadSpecialistQuestionRecords } from '../onboarding/onboarding-questions';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompletePlanItemDto } from '../user-plan/dto/complete-plan-item.dto';
import {
  athleteDate,
  ATHLETE_TIME_ZONE,
  calendarRange,
  dateOnly,
  finishTrainingSession,
} from './training-sessions';
import {
  areaSessionInclude,
  areaSessionView,
  completedStreak,
  performanceView,
  sessionInclude,
  sessionView,
  snapshotInclude,
} from './athlete-views';
import { finishAreaSession } from './area-sessions';
import { dueCheckIn } from './athlete-check-in';

@Injectable()
export class AthleteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: CycleCompletionService,
    private readonly lifecycle: TrainingLifecycleOrchestrator,
  ) {}
  async calendar(userId: string, from: string, to: string) {
    const scheduledDate = calendarRange(from, to);
    const today = athleteDate();
    const order = [
      { scheduledDate: 'asc' as const },
      { sequence: 'asc' as const },
      { id: 'asc' as const },
    ];
    const [sessions, areaSessions] = await Promise.all([
      this.prisma.trainingSession.findMany({
        where: { userId, scheduledDate },
        include: sessionInclude,
        orderBy: order,
      }),
      this.prisma.areaSession.findMany({
        where: { userId, scheduledDate },
        include: areaSessionInclude,
        orderBy: order,
      }),
    ]);
    return {
      from,
      to,
      today,
      timeZone: ATHLETE_TIME_ZONE,
      // Le due tracce convivono nello stesso calendario, sportiva per prima a parita di data.
      sessions: [
        ...sessions.map((s) => sessionView(s, today)),
        ...areaSessions.map((s) => areaSessionView(s, today)),
      ].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.track.localeCompare(b.track) ||
          a.sequence - b.sequence,
      ),
    };
  }
  async session(userId: string, id: string) {
    const s = await this.prisma.trainingSession.findFirst({
      where: { id, userId },
      include: sessionInclude,
    });
    if (s) return sessionView(s);
    const areaSession = await this.prisma.areaSession.findFirst({
      where: { id, userId },
      include: areaSessionInclude,
    });
    if (!areaSession) throw new NotFoundException('Sessione non trovata');
    return areaSessionView(areaSession);
  }
  async finish(
    userId: string,
    id: string,
    status: 'COMPLETED' | 'SKIPPED',
    input: CompletePlanItemDto = {},
  ) {
    const owned = await this.prisma.trainingSession.count({
      where: { id, userId },
    });
    // Le sessioni di area chiudono la loro attivita senza toccare il ciclo sportivo.
    if (!owned)
      return finishAreaSession(this.prisma, userId, id, status, input);
    const result = await finishTrainingSession(
      this.prisma,
      userId,
      id,
      status,
      input,
    );
    await this.completion.reconcileTrainingLifecycle(userId);
    return result;
  }
  async progress(userId: string) {
    const order = await this.driverOrder(userId);
    const snapshots = await this.prisma.performanceProfileSnapshot.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: snapshotInclude,
    });
    return {
      current: performanceView(snapshots[0] ?? null, order),
      history: snapshots.map((s) => performanceView(s, order)!),
    };
  }
  checkIn(userId: string) {
    return dueCheckIn(this.prisma, userId);
  }
  async home(userId: string) {
    const today = athleteDate();
    const [user, snapshot, plan, checkIn, completed, order] = await Promise.all(
      [
        this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            firstName: true,
            discovery: { select: { programDurationWeeks: true } },
            onboardingAssessment: { select: { profileJson: true } },
            athleteCoachLinks: {
              select: {
                coach: {
                  select: { firstName: true, lastName: true, email: true },
                },
              },
            },
          },
        }),
        this.prisma.performanceProfileSnapshot.findFirst({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: snapshotInclude,
        }),
        this.prisma.trainingPlanRelease.findFirst({
          where: { userId, status: 'ACTIVE', cycleStatus: 'PUBLISHED' },
          orderBy: { version: 'desc' },
          select: {
            id: true,
            summaryText: true,
            version: true,
            startsOn: true,
            endsOn: true,
            windowDays: true,
            outputJson: true,
            sessions: {
              include: sessionInclude,
              orderBy: [{ scheduledDate: 'asc' }, { sequence: 'asc' }],
            },
          },
        }),
        this.checkIn(userId),
        this.prisma.trainingSession.findMany({
          where: { userId, status: 'COMPLETED', completedAt: { not: null } },
          select: { completedAt: true },
        }),
        this.driverOrder(userId),
      ],
    );
    const lifecycle = await this.lifecycle.current(userId);
    const sessions = plan?.sessions.map((s) => sessionView(s, today)) ?? [];
    const due = sessions.find(
      (s) => s.date === today && s.status === 'SCHEDULED',
    );
    const next =
      sessions.find((s) => s.date > today && s.status === 'SCHEDULED') ?? null;
    const waitingForWindow = Boolean(
      plan?.endsOn &&
      plan.endsOn > dateOnly(today) &&
      sessions.length &&
      sessions.every((s) => s.status !== 'SCHEDULED') &&
      !checkIn,
    );
    const primaryAction = due
      ? { type: 'TRAINING_SESSION', session: due }
      : checkIn
        ? { type: 'CHECK_IN' }
        : next
          ? { type: 'TRAINING_SESSION', session: next }
          : !plan
            ? {
                type:
                  lifecycle.status === 'EMPTY' ||
                  lifecycle.status === 'COMPLETED'
                    ? 'REQUEST_PLAN'
                    : lifecycle.status === 'ERROR'
                      ? 'ERROR'
                      : 'PREPARING',
              }
            : { type: waitingForWindow ? 'WINDOW_COMPLETE' : 'NONE' };
    const start = dateOnly(today);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const end = new Date(start.getTime() + 6 * 86400000);
    return {
      lifecycle,
      firstName: user.firstName,
      today,
      timeZone: ATHLETE_TIME_ZONE,
      performance: performanceView(snapshot, order),
      program: {
        durationWeeks:
          user.discovery?.programDurationWeeks ??
          (Number(
            profileValue(
              user.onboardingAssessment?.profileJson,
              'program_duration_weeks',
            ),
          ) ||
            null),
        cycle:
          plan?.startsOn && plan.endsOn
            ? {
                version: plan.version,
                startsOn: plan.startsOn.toISOString().slice(0, 10),
                endsOn: plan.endsOn.toISOString().slice(0, 10),
                windowDays: plan.windowDays,
                ...rollingSummary(plan.outputJson),
              }
            : null,
        status: plan ? 'ACTIVE' : lifecycle.status,
        summary: plan?.summaryText ?? null,
        completed: sessions.filter((s) => s.status === 'COMPLETED').length,
        total: sessions.length,
      },
      primaryAction,
      nextSession: next,
      checkIn: checkIn
        ? {
            id: checkIn.id,
            title: checkIn.title,
            kind: checkIn.kind,
            count: checkIn.questions.length,
          }
        : null,
      streak: {
        days: completedStreak(
          completed.flatMap((s) => (s.completedAt ? [s.completedAt] : [])),
          today,
        ),
      },
      week: await this.calendar(
        userId,
        start.toISOString().slice(0, 10),
        end.toISOString().slice(0, 10),
      ),
      coaches: user.athleteCoachLinks.map((l) => ({
        name:
          [l.coach.firstName, l.coach.lastName].filter(Boolean).join(' ') ||
          l.coach.email,
      })),
    };
  }
  private async driverOrder(userId: string) {
    return [
      ...new Set(
        (await loadSpecialistQuestionRecords(this.prisma, userId)).map(
          (q) => q.areaId!,
        ),
      ),
    ];
  }
}

function rollingSummary(output: unknown) {
  const root =
    output && typeof output === 'object' && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : {};
  const window =
    root.trainingWindow && typeof root.trainingWindow === 'object'
      ? (root.trainingWindow as Record<string, unknown>)
      : {};
  return {
    sessionsPerWeek:
      typeof root.sessionsPerWeek === 'number' ? root.sessionsPerWeek : null,
    macroBlock:
      typeof window.macroBlock === 'number' ? window.macroBlock : null,
    windowInProgram:
      typeof window.windowInProgram === 'number'
        ? window.windowInProgram
        : null,
    windowsPerProgram:
      typeof window.windowsPerProgram === 'number'
        ? window.windowsPerProgram
        : null,
  };
}
