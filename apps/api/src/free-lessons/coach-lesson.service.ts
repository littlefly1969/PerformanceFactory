import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { CalibrationService } from '../discovery/calibration/calibration.service';
import {
  COACH_RATINGS,
  lockCalibration,
} from '../discovery/calibration/lesson-evidence';
import { performanceDriverName as driverName } from '../performance/performance-display';
import { PrismaService } from '../prisma/prisma.service';
import { OCCUPYING_SEATS } from './free-lesson-rules';
import { lockLesson, releaseCalibration } from './lesson-hold';

const DAY_MS = 24 * 60 * 60 * 1000;
const logger = new Logger('CoachLessons');

/**
 * Il coach del circolo vede solo gli atleti delle sue lezioni (nome, livello
 * stimato, driver), con ogni accesso tracciato, e invia il feedback che entra
 * come fonte distinta nella calibrazione (A4.8, A7.2).
 */
@Injectable()
export class CoachLessonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly calibration: CalibrationService,
  ) {}

  async lessons(coachId: string, now = new Date()) {
    const lessons = await this.prisma.freeLesson.findMany({
      where: {
        coachId,
        status: { not: 'CANCELLED' },
        startsAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
      },
      orderBy: { startsAt: 'asc' },
      include: {
        partner: { select: { name: true, city: true } },
        seats: {
          where: { status: { in: OCCUPYING_SEATS } },
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        feedback: { select: { userId: true, areaId: true, rating: true } },
      },
    });
    const ids = lessons.flatMap((l) => l.seats.map((s) => s.userId));
    const evaluations = await this.prisma.assessmentEvaluation.findMany({
      where: { userId: { in: ids } },
      orderBy: { sequence: 'desc' },
      distinct: ['userId'],
      select: {
        userId: true,
        level: true,
        areas: { select: { areaId: true, area: { select: { name: true } } } },
      },
    });
    if (ids.length)
      await this.prisma.dataAccessAudit.createMany({
        data: ids.map((targetUserId) => ({
          actorId: coachId,
          actorRole: 'PROFESSIONAL',
          targetUserId,
          resource: 'FREE_LESSON_PARTICIPANT',
          action: 'READ',
        })),
      });
    return {
      ratings: COACH_RATINGS,
      lessons: lessons.map((l) => ({
        id: l.id,
        club: l.partner,
        startsAt: l.startsAt,
        durationMinutes: l.durationMinutes,
        levelLabel: l.levelLabel,
        status: l.status,
        started: l.startsAt <= now,
        participants: l.seats.map((s) => {
          const evaluation = evaluations.find((e) => e.userId === s.userId);
          return {
            userId: s.userId,
            firstName: s.user.firstName,
            lastName: s.user.lastName,
            status: s.status,
            level: evaluation?.level ?? null,
            drivers: (evaluation?.areas ?? []).map((a) => ({
              areaId: a.areaId,
              name: driverName(a.area.name),
            })),
            feedback: l.feedback
              .filter((f) => f.userId === s.userId)
              .map(({ areaId, rating }) => ({ areaId, rating })),
          };
        }),
      })),
    };
  }

  /** Lezione del coach, sotto lock; il feedback arriva solo dopo l'inizio. */
  private async ownLesson(
    tx: Prisma.TransactionClient,
    lessonId: string,
    coachId: string,
    now: Date,
  ) {
    await lockLesson(tx, lessonId);
    const lesson = await tx.freeLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lezione non trovata');
    if (lesson.coachId !== coachId)
      throw new ForbiddenException('Non sei il coach di questa lezione');
    if (lesson.status === 'CANCELLED')
      throw new ConflictException('La lezione è stata annullata');
    if (lesson.startsAt > now)
      throw new ConflictException('La lezione non è ancora iniziata');
    return lesson;
  }

  /**
   * Feedback per atleta e driver (voto 1-5 più una nota). Una sola volta: un
   * reinvio dello stesso feedback non crea nulla. Dopo il salvataggio parte
   * la rivalutazione; se non riesce, riparte al prossimo round dell'atleta.
   */
  async submitFeedback(
    coachId: string,
    lessonId: string,
    input: {
      userId: string;
      ratings: Array<{ areaId: string; rating: number }>;
      note?: string;
    },
    now = new Date(),
  ) {
    const areaIds = input.ratings.map((r) => r.areaId);
    if (!areaIds.length || new Set(areaIds).size !== areaIds.length)
      throw new BadRequestException('Un voto per ogni driver valutato');
    if (
      input.ratings.some(
        (r) => !COACH_RATINGS.some((c) => c.value === r.rating),
      )
    )
      throw new BadRequestException('Voto non valido');
    const note = input.note?.trim() || null;
    const saved = await this.prisma.$transaction(async (tx) => {
      const lesson = await this.ownLesson(tx, lessonId, coachId, now);
      const seat = await tx.freeLessonSeat.findUnique({
        where: { userId: input.userId },
      });
      if (seat?.lessonId !== lessonId)
        throw new NotFoundException('Atleta non presente in questa lezione');
      if (seat.status === 'ATTENDED') return false;
      if (seat.status !== 'ASSIGNED')
        throw new ConflictException('L’atleta è segnato come assente');
      const latest = await tx.assessmentEvaluation.findFirst({
        where: { userId: input.userId },
        orderBy: { sequence: 'desc' },
        select: { areas: { select: { areaId: true } } },
      });
      if (areaIds.some((id) => !latest?.areas.some((a) => a.areaId === id)))
        throw new BadRequestException('Driver non valutato per questo atleta');
      await tx.coachLessonFeedback.createMany({
        data: input.ratings.map((r) => ({
          lessonId,
          userId: input.userId,
          coachId,
          areaId: r.areaId,
          rating: r.rating,
          note,
        })),
      });
      await tx.freeLessonSeat.update({
        where: { userId: input.userId },
        data: { status: 'ATTENDED' },
      });
      await this.completeIfDone(tx, lessonId);
      await this.analytics.trackServer(
        'lesson_completed',
        {
          userId: input.userId,
          properties: { lesson_id: lessonId, coach_id: coachId },
        },
        tx,
      );
      await this.analytics.trackServer(
        'coach_feedback_submitted',
        {
          userId: input.userId,
          properties: {
            lesson_id: lessonId,
            club_id: lesson.partnerId,
            areas: areaIds.length,
            structured_scores: input.ratings
              .map((r) => `${r.areaId}:${r.rating}`)
              .join(',')
              .slice(0, 200),
          },
        },
        tx,
      );
      return true;
    });
    if (saved)
      try {
        await this.calibration.evaluateLessonFeedback(input.userId);
      } catch (error) {
        logger.warn(
          `Feedback della lezione ${lessonId} salvato, valutazione rinviata: ${(error as Error).message}`,
        );
      }
    return { saved };
  }

  /** Assenza: il beneficio è consumato e R torna a poter chiudersi per soglia. */
  async markNoShow(
    coachId: string,
    lessonId: string,
    userId: string,
    now = new Date(),
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.ownLesson(tx, lessonId, coachId, now);
      await lockCalibration(tx, userId);
      const seat = await tx.freeLessonSeat.findUnique({ where: { userId } });
      if (seat?.lessonId !== lessonId)
        throw new NotFoundException('Atleta non presente in questa lezione');
      if (seat.status === 'NO_SHOW') return;
      if (seat.status !== 'ASSIGNED')
        throw new ConflictException('Il feedback è già stato inviato');
      await tx.freeLessonSeat.update({
        where: { userId },
        data: { status: 'NO_SHOW' },
      });
      await releaseCalibration(tx, userId);
      await this.completeIfDone(tx, lessonId);
    });
  }

  private async completeIfDone(tx: Prisma.TransactionClient, lessonId: string) {
    const open = await tx.freeLessonSeat.count({
      where: { lessonId, status: 'ASSIGNED' },
    });
    if (!open)
      await tx.freeLesson.update({
        where: { id: lessonId },
        data: { status: 'COMPLETED' },
      });
  }
}
