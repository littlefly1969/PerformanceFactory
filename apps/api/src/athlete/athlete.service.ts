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
  completedStreak,
  performanceView,
  sessionInclude,
  sessionView,
  snapshotInclude,
} from './athlete-views';
import { dueCheckIn } from './athlete-check-in';

@Injectable()
export class AthleteService {
  constructor(private readonly prisma: PrismaService) {}
  async calendar(userId: string, from: string, to: string) {
    const scheduledDate = calendarRange(from, to);
    const today = athleteDate();
    const sessions = await this.prisma.trainingSession.findMany({
      where: { userId, scheduledDate },
      include: sessionInclude,
      orderBy: [{ scheduledDate: 'asc' }, { sequence: 'asc' }, { id: 'asc' }],
    });
    return {
      from,
      to,
      today,
      timeZone: ATHLETE_TIME_ZONE,
      sessions: sessions.map((s) => sessionView(s, today)),
    };
  }
  async session(userId: string, id: string) {
    const s = await this.prisma.trainingSession.findFirst({
      where: { id, userId },
      include: sessionInclude,
    });
    if (!s) throw new NotFoundException('Sessione non trovata');
    return sessionView(s);
  }
  finish(
    userId: string,
    id: string,
    status: 'COMPLETED' | 'SKIPPED',
    input: CompletePlanItemDto = {},
  ) {
    return finishTrainingSession(this.prisma, userId, id, status, input);
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
    const sessions = plan?.sessions.map((s) => sessionView(s, today)) ?? [];
    const due = sessions.find(
      (s) => s.date === today && s.status === 'SCHEDULED',
    );
    const next =
      sessions.find((s) => s.date > today && s.status === 'SCHEDULED') ?? null;
    const primaryAction = due
      ? { type: 'TRAINING_SESSION', session: due }
      : checkIn
        ? { type: 'CHECK_IN' }
        : next
          ? { type: 'TRAINING_SESSION', session: next }
          : !plan
            ? { type: 'PREPARING' }
            : { type: 'NONE' };
    const start = dateOnly(today);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const end = new Date(start.getTime() + 6 * 86400000);
    return {
      firstName: user.firstName,
      today,
      timeZone: ATHLETE_TIME_ZONE,
      performance: performanceView(snapshot, order),
      program: {
        durationWeeks: user.discovery?.programDurationWeeks ?? null,
        status: plan ? 'ACTIVE' : 'PREPARING',
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
