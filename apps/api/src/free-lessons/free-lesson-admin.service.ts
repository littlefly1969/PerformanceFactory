import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { loadScaleConfig } from '../ai-orchestrator/performance-scoring';
import { AnalyticsService } from '../analytics/analytics.service';
import { lockCalibration } from '../discovery/calibration/lesson-evidence';
import { performanceDriverName as driverName } from '../performance/performance-display';
import { PrismaService } from '../prisma/prisma.service';
import { loadFreeLessonSettings } from './free-lesson-config';
import { OCCUPYING_SEATS, microTestOptionProblems } from './free-lesson-rules';
import { holdCalibration, lockLesson, releaseCalibration } from './lesson-hold';

type Option = { value: string; label: string; score: number };

/**
 * Back office della lezione gratuita: circoli che la offrono, lezioni con
 * coach e capienza, composizione manuale dei gruppi, catalogo dei micro-test.
 * Le regole operative restano aperte (A4-D04, A7-D01): nulla è automatico.
 */
@Injectable()
export class FreeLessonAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async overview() {
    const [clubs, lessons, requests, coaches, microTests, areas] =
      await Promise.all([
        this.prisma.partner.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            city: true,
            freeLessonsEnabled: true,
          },
          orderBy: { name: 'asc' },
        }),
        this.prisma.freeLesson.findMany({
          where: { status: { not: 'CANCELLED' } },
          orderBy: { startsAt: 'asc' },
          include: {
            partner: { select: { name: true } },
            coach: { select: { id: true, email: true, firstName: true } },
            seats: {
              where: { status: { in: OCCUPYING_SEATS } },
              select: { userId: true, status: true },
            },
          },
        }),
        this.prisma.freeLessonSeat.findMany({
          where: { status: 'REQUESTED' },
          orderBy: { requestedAt: 'asc' },
          include: { partner: { select: { name: true } } },
        }),
        this.prisma.user.findMany({
          where: { role: UserRole.PROFESSIONAL, isActive: true },
          select: { id: true, email: true, firstName: true, lastName: true },
          orderBy: { email: 'asc' },
        }),
        // Solo il catalogo: i test su misura restano dell'atleta.
        this.prisma.microTest.findMany({
          where: { userId: null },
          orderBy: { createdAt: 'asc' },
          include: { area: { select: { name: true } } },
        }),
        this.prisma.area.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);
    const athletes = await this.athletes([
      ...new Set([
        ...requests.map((r) => r.userId),
        ...lessons.flatMap((l) => l.seats.map((s) => s.userId)),
      ]),
    ]);
    return {
      settings: await loadFreeLessonSettings(this.prisma),
      clubs,
      coaches,
      areas: areas.map((a) => ({ id: a.id, name: driverName(a.name) })),
      lessons: lessons.map((l) => ({
        id: l.id,
        partnerId: l.partnerId,
        club: l.partner.name,
        startsAt: l.startsAt,
        durationMinutes: l.durationMinutes,
        capacity: l.capacity,
        levelLabel: l.levelLabel,
        status: l.status,
        coach: l.coach,
        seats: l.seats.map((s) => ({ ...athletes.get(s.userId), ...s })),
      })),
      // Richieste ordinate per circolo e livello: il gruppo omogeneo lo compone l'admin.
      requests: requests
        .map((r) => ({
          ...athletes.get(r.userId),
          userId: r.userId,
          partnerId: r.partnerId,
          club: r.partner.name,
          requestedAt: r.requestedAt,
        }))
        .sort(
          (a, b) =>
            a.club.localeCompare(b.club) ||
            (a.levelRank ?? 0) - (b.levelRank ?? 0),
        ),
      microTests: microTests.map((t) => ({
        id: t.id,
        areaId: t.areaId,
        areaName: driverName(t.area.name),
        title: t.title,
        instructions: t.instructions,
        options: t.optionsJson as Option[],
        isActive: t.isActive,
      })),
    };
  }

  /** Nome, livello stimato e scadenza della calibrazione per comporre i gruppi. */
  private async athletes(ids: string[]) {
    const LEVELS = [
      'BEGINNER',
      'INTERMEDIATE',
      'ADVANCED',
      'COMPETITIVE',
      'PRO',
    ];
    const [users, evaluations, calibrations] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true, firstName: true, lastName: true },
      }),
      this.prisma.assessmentEvaluation.findMany({
        where: { userId: { in: ids } },
        orderBy: { sequence: 'desc' },
        distinct: ['userId'],
        select: { userId: true, level: true, levelConfidence: true },
      }),
      this.prisma.athleteCalibration.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, status: true, deadlineAt: true },
      }),
    ]);
    return new Map(
      users.map((u) => {
        const evaluation = evaluations.find((e) => e.userId === u.id);
        const calibration = calibrations.find((c) => c.userId === u.id);
        return [
          u.id,
          {
            email: u.email,
            name: [u.firstName, u.lastName].filter(Boolean).join(' '),
            level: evaluation?.level ?? null,
            levelConfidence: evaluation?.levelConfidence ?? null,
            levelRank: evaluation?.level
              ? LEVELS.indexOf(evaluation.level)
              : null,
            calibrationStatus: calibration?.status ?? null,
            deadlineAt: calibration?.deadlineAt ?? null,
          },
        ];
      }),
    );
  }

  setClub(partnerId: string, freeLessonsEnabled: boolean) {
    return this.prisma.partner.update({
      where: { id: partnerId },
      data: { freeLessonsEnabled },
      select: { id: true, freeLessonsEnabled: true },
    });
  }

  async createLesson(
    input: {
      partnerId: string;
      startsAt: string;
      coachId?: string;
      capacity?: number;
      levelLabel?: string;
    },
    actorId: string,
    now = new Date(),
  ) {
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= now)
      throw new BadRequestException('La lezione deve essere nel futuro');
    const club = await this.prisma.partner.findFirst({
      where: { id: input.partnerId, isActive: true, freeLessonsEnabled: true },
    });
    if (!club)
      throw new BadRequestException('Il circolo non offre la lezione gratuita');
    if (input.coachId) await this.requireCoach(input.coachId);
    return this.prisma.freeLesson.create({
      data: {
        partnerId: input.partnerId,
        startsAt,
        coachId: input.coachId ?? null,
        capacity: input.capacity ?? 4,
        levelLabel: input.levelLabel?.trim() || null,
        createdById: actorId,
      },
    });
  }

  async setCoach(lessonId: string, coachId: string | null) {
    if (coachId) await this.requireCoach(coachId);
    return this.prisma.$transaction(async (tx) => {
      await lockLesson(tx, lessonId);
      const lesson = await this.requireLesson(tx, lessonId);
      if (lesson.status !== 'SCHEDULED')
        throw new ConflictException('La lezione non è più modificabile');
      return tx.freeLesson.update({
        where: { id: lessonId },
        data: { coachId },
      });
    });
  }

  private async requireCoach(coachId: string) {
    const coach = await this.prisma.user.findFirst({
      where: { id: coachId, role: UserRole.PROFESSIONAL, isActive: true },
    });
    if (!coach) throw new BadRequestException('Coach non valido');
  }

  private async requireLesson(tx: Prisma.TransactionClient, lessonId: string) {
    const lesson = await tx.freeLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lezione non trovata');
    return lesson;
  }

  /**
   * Assegna un posto a un atleta che l'ha richiesto. Sotto lock della lezione
   * (capienza) e della calibrazione (R ancora aperta, livello stimato): R
   * non si consolida fino al feedback del coach. Il tempo trascorso non chiude
   * più R, quindi la data della lezione non ha vincoli di scadenza.
   */
  async assign(lessonId: string, userId: string, now = new Date()) {
    await this.prisma.$transaction(async (tx) => {
      await lockLesson(tx, lessonId);
      await lockCalibration(tx, userId);
      const lesson = await this.requireLesson(tx, lessonId);
      if (lesson.status !== 'SCHEDULED' || lesson.startsAt <= now)
        throw new ConflictException('La lezione non accetta più atleti');
      const [seat, calibration, taken] = await Promise.all([
        tx.freeLessonSeat.findUnique({ where: { userId } }),
        tx.athleteCalibration.findUnique({ where: { userId } }),
        tx.freeLessonSeat.count({
          where: { lessonId, status: { in: OCCUPYING_SEATS } },
        }),
      ]);
      if (seat?.lessonId === lessonId && seat.status === 'ASSIGNED') return;
      if (!seat || seat.status !== 'REQUESTED')
        throw new ConflictException('L’atleta non ha una richiesta aperta');
      if (seat.partnerId !== lesson.partnerId)
        throw new ConflictException('L’atleta ha scelto un altro circolo');
      if (taken >= lesson.capacity)
        throw new ConflictException('La lezione è al completo');
      // Dalla richiesta la calibrazione aspetta già la lezione.
      if (
        calibration?.status !== 'FREE_LEVEL_ESTIMATED' &&
        calibration?.status !== 'FREE_LESSON_VALIDATION'
      )
        throw new ConflictException(
          'Serve il livello stimato con la calibrazione ancora aperta',
        );
      await tx.freeLessonSeat.update({
        where: { userId },
        data: { status: 'ASSIGNED', lessonId, assignedAt: now },
      });
      await holdCalibration(tx, userId);
      await this.analytics.trackServer(
        'lesson_booked',
        {
          userId,
          properties: { lesson_id: lessonId, club_id: lesson.partnerId },
        },
        tx,
      );
    });
  }

  /** Toglie l'atleta dal gruppo: la richiesta resta e R continua ad aspettare la lezione. */
  async unassign(lessonId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockLesson(tx, lessonId);
      await lockCalibration(tx, userId);
      const moved = await tx.freeLessonSeat.updateMany({
        where: { userId, lessonId, status: 'ASSIGNED' },
        data: { status: 'REQUESTED', lessonId: null, assignedAt: null },
      });
      if (!moved.count)
        throw new ConflictException('L’atleta non è in questa lezione');
      await releaseCalibration(tx, userId);
    });
  }

  /** Annulla la lezione: i posti assegnati tornano richieste da ricollocare. */
  async cancel(lessonId: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockLesson(tx, lessonId);
      const lesson = await this.requireLesson(tx, lessonId);
      if (lesson.status === 'CANCELLED') return;
      const seats = await tx.freeLessonSeat.findMany({
        where: { lessonId },
        orderBy: { userId: 'asc' },
      });
      if (seats.some((s) => s.status !== 'ASSIGNED'))
        throw new ConflictException('La lezione si è già svolta');
      for (const seat of seats) {
        await lockCalibration(tx, seat.userId);
        await tx.freeLessonSeat.update({
          where: { userId: seat.userId },
          data: { status: 'REQUESTED', lessonId: null, assignedAt: null },
        });
        await releaseCalibration(tx, seat.userId);
      }
      await tx.freeLesson.update({
        where: { id: lessonId },
        data: { status: 'CANCELLED' },
      });
    });
  }

  async createMicroTest(input: {
    areaId: string;
    title: string;
    instructions: string;
    options: Option[];
  }) {
    const scale = await loadScaleConfig(this.prisma);
    const options = input.options.map((o) => ({
      value: o.value.trim(),
      label: o.label.trim(),
      score: Number(o.score),
    }));
    const problems = microTestOptionProblems(options, scale);
    if (problems.length) throw new BadRequestException(problems.join('. '));
    const area = await this.prisma.area.findUnique({
      where: { id: input.areaId },
    });
    if (!area) throw new BadRequestException('Driver non trovato');
    return this.prisma.microTest.create({
      data: {
        areaId: input.areaId,
        title: input.title.trim(),
        instructions: input.instructions.trim(),
        optionsJson: options,
      },
    });
  }

  /** I micro-test si disattivano, non si cancellano: gli esiti restano leggibili. */
  async setMicroTestActive(id: string, isActive: boolean) {
    const updated = await this.prisma.microTest.updateMany({
      where: { id, userId: null },
      data: { isActive },
    });
    if (!updated.count) throw new NotFoundException('Micro-test non trovato');
    return { id, isActive };
  }
}
