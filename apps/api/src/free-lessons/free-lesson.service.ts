import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  isCalibrationOpen,
  lockCalibration,
} from '../discovery/calibration/lesson-evidence';
import { FeatureFlagsService } from '../features/feature-flags.service';
import { performanceDriverName as driverName } from '../performance/performance-display';
import { PrismaService } from '../prisma/prisma.service';
import { loadFreeLessonSettings, syncCredits } from './free-lesson-config';
import { lessonEligibility } from './free-lesson-rules';
import { releaseCalibration } from './lesson-hold';
import { MicroTestGenerationService } from './micro-test-generation.service';

const DAY_MS = 24 * 60 * 60 * 1000;

type Option = { value: string; label: string; score: number };

/**
 * Lezione gratuita lato atleta: obiettivo visibile dall'inizio della prova,
 * crediti guadagnati con le interazioni che rendono R più affidabile,
 * richiesta del posto quando le condizioni ci sono (A4.8, A7.2).
 */
@Injectable()
export class FreeLessonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly analytics: AnalyticsService,
    private readonly generation: MicroTestGenerationService,
  ) {}

  private async requireEnabled(userId: string) {
    if (!(await this.flags.isEnabled('free_lesson', userId)))
      throw new ForbiddenException('La lezione gratuita non è attiva');
  }

  async view(userId: string, now = new Date()) {
    if (!(await this.flags.isEnabled('free_lesson', userId)))
      return { enabled: false as const };
    const settings = await loadFreeLessonSettings(this.prisma);
    const credits = await syncCredits(this.prisma, userId, settings);
    const [calibration, seat, clubs, attribution] = await Promise.all([
      this.prisma.athleteCalibration.findUnique({ where: { userId } }),
      this.prisma.freeLessonSeat.findUnique({
        where: { userId },
        include: {
          partner: { select: { name: true, city: true } },
          lesson: {
            select: { startsAt: true, durationMinutes: true, status: true },
          },
        },
      }),
      this.prisma.partner.findMany({
        where: { isActive: true, freeLessonsEnabled: true },
        select: { id: true, name: true, city: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.userAttribution.findUnique({
        where: { userId },
        select: { partnerId: true },
      }),
    ]);
    const { phase, missing } = lessonEligibility({
      calibrationStatus: calibration?.status ?? null,
      credits,
      creditsToUnlock: settings.creditsToUnlock,
      clubs: clubs.length,
      seatStatus: seat?.status ?? null,
    });
    const clubId = clubs.some((c) => c.id === attribution?.partnerId)
      ? attribution!.partnerId
      : null;
    if (phase === 'ELIGIBLE')
      await this.analytics.trackServerOnce('lesson_eligible', {
        userId,
        onceKey: userId,
        properties: { club_id: clubId ?? '' },
      });
    return {
      enabled: true as const,
      phase,
      missing,
      credits: { balance: credits, toUnlock: settings.creditsToUnlock },
      earn: {
        initialAssessment: settings.creditsInitialAssessment,
        calibrationRound: settings.creditsCalibrationRound,
        microTest: settings.creditsMicroTest,
      },
      clubs,
      attributedClubId: clubId,
      seat: seat
        ? {
            status: seat.status,
            club: seat.partner,
            lesson:
              seat.lesson && seat.status !== 'WITHDRAWN'
                ? {
                    startsAt: seat.lesson.startsAt,
                    durationMinutes: seat.lesson.durationMinutes,
                  }
                : null,
          }
        : null,
      ...(await this.microTests(
        userId,
        isCalibrationOpen(calibration?.status),
        settings.microTestsPerDay,
        now,
      )),
    };
  }

  /**
   * Micro-test proposti oggi: prima quelli scritti dall'AI per l'atleta
   * (ultimo lotto pronto), poi il catalogo del back office, sui driver con la
   * confidence più bassa, uno per test e mai oltre il limite delle ultime 24
   * ore. Solo a calibrazione aperta.
   */
  private async microTests(
    userId: string,
    open: boolean,
    perDay: number,
    now: Date,
  ) {
    const none = {
      microTests: [],
      microTestsLeft: 0,
      generateMicroTests: false,
    };
    if (!open || perDay === 0) return none;
    const [latest, done, batch] = await Promise.all([
      this.prisma.assessmentEvaluation.findFirst({
        where: { userId },
        orderBy: { sequence: 'desc' },
        select: { areas: { select: { areaId: true, confidence: true } } },
      }),
      this.prisma.microTestCompletion.findMany({
        where: { userId },
        select: { microTestId: true, completedAt: true },
      }),
      this.prisma.microTestGeneration.findFirst({
        where: { userId, status: 'READY' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }),
    ]);
    const recent = done.filter(
      (d) => d.completedAt.getTime() > now.getTime() - DAY_MS,
    ).length;
    const left = Math.max(0, perDay - recent);
    if (!latest || !left) return { ...none, microTestsLeft: left };
    const confidence = new Map(
      latest.areas.map((a) => [a.areaId, a.confidence]),
    );
    const tests = await this.prisma.microTest.findMany({
      where: {
        isActive: true,
        areaId: { in: [...confidence.keys()] },
        id: { notIn: done.map((d) => d.microTestId) },
        OR: [
          { userId: null },
          ...(batch ? [{ userId, generationId: batch.id }] : []),
        ],
      },
      include: { area: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // Su misura prima del catalogo, poi i driver meno affidabili.
    tests.sort(
      (a, b) =>
        Number(!a.userId) - Number(!b.userId) ||
        confidence.get(a.areaId)! - confidence.get(b.areaId)!,
    );
    return {
      microTestsLeft: left,
      generateMicroTests: await this.generation.shouldGenerate(userId, now),
      microTests: tests.slice(0, left).map((t) => ({
        id: t.id,
        title: t.title,
        instructions: t.instructions,
        areaName: driverName(t.area.name),
        personal: !!t.userId,
        // Il punteggio degli esiti resta sul server, come per i round.
        options: (t.optionsJson as Option[]).map(({ value, label }) => ({
          value,
          label,
        })),
      })),
    };
  }

  /** Prepara i micro-test su misura per l'ultima valutazione, poi restituisce il pannello. */
  async generateMicroTests(userId: string, now = new Date()) {
    await this.requireEnabled(userId);
    const calibration = await this.prisma.athleteCalibration.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (!isCalibrationOpen(calibration?.status))
      throw new ConflictException('La calibrazione è chiusa');
    await this.generation.generate(userId, now);
    return this.view(userId, now);
  }

  /** Esito di un micro-test: una volta per test, entro il limite giornaliero. */
  async completeMicroTest(
    userId: string,
    microTestId: string,
    value: string,
    now = new Date(),
  ) {
    await this.requireEnabled(userId);
    const [test, settings] = await Promise.all([
      // Un test su misura vale solo per il suo atleta.
      this.prisma.microTest.findFirst({
        where: {
          id: microTestId,
          isActive: true,
          OR: [{ userId: null }, { userId }],
        },
      }),
      loadFreeLessonSettings(this.prisma),
    ]);
    if (!test) throw new NotFoundException('Micro-test non trovato');
    if (!(test.optionsJson as Option[]).some((o) => o.value === value))
      throw new BadRequestException('Esito non valido');
    await this.prisma.$transaction(async (tx) => {
      // Lock per atleta: il limite giornaliero vale anche con invii paralleli.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`micro-test:${userId}`}))`;
      const already = await tx.microTestCompletion.findUnique({
        where: { userId_microTestId: { userId, microTestId } },
      });
      if (already) return;
      const calibration = await tx.athleteCalibration.findUnique({
        where: { userId },
        select: { status: true },
      });
      if (!isCalibrationOpen(calibration?.status))
        throw new ConflictException('La calibrazione è chiusa');
      const latest = await tx.assessmentEvaluation.findFirst({
        where: { userId },
        orderBy: { sequence: 'desc' },
        select: { areas: { select: { areaId: true } } },
      });
      if (!latest?.areas.some((a) => a.areaId === test.areaId))
        throw new BadRequestException('Micro-test non previsto per te');
      const recent = await tx.microTestCompletion.count({
        where: {
          userId,
          completedAt: { gt: new Date(now.getTime() - DAY_MS) },
        },
      });
      if (recent >= settings.microTestsPerDay)
        throw new ConflictException({
          code: 'MICRO_TEST_DAILY_LIMIT',
          message: 'Hai già fatto i micro-test di oggi. Riprendi domani.',
        });
      await tx.microTestCompletion.create({
        data: { userId, microTestId, value, completedAt: now },
      });
    });
    return this.view(userId, now);
  }

  /**
   * Richiesta del posto: 1 per atleta, presso un circolo che offre la lezione,
   * con il consenso a mostrare al coach nome, livello e driver. Ripetere la
   * richiesta non crea un secondo posto.
   */
  async request(userId: string, partnerId: string, shareWithCoach: boolean) {
    await this.requireEnabled(userId);
    if (!shareWithCoach)
      throw new BadRequestException(
        'Per la lezione il coach deve poter vedere il tuo livello',
      );
    const club = await this.prisma.partner.findFirst({
      where: { id: partnerId, isActive: true, freeLessonsEnabled: true },
      select: { id: true },
    });
    if (!club) throw new BadRequestException('Circolo non disponibile');
    const settings = await loadFreeLessonSettings(this.prisma);
    const credits = await syncCredits(this.prisma, userId, settings);
    await this.prisma.$transaction(async (tx) => {
      await lockCalibration(tx, userId);
      const [calibration, seat] = await Promise.all([
        tx.athleteCalibration.findUnique({
          where: { userId },
          select: { status: true },
        }),
        tx.freeLessonSeat.findUnique({ where: { userId } }),
      ]);
      if (seat?.status === 'REQUESTED' && seat.partnerId === partnerId) return;
      const { phase, missing } = lessonEligibility({
        calibrationStatus: calibration?.status ?? null,
        credits,
        creditsToUnlock: settings.creditsToUnlock,
        clubs: 1,
        seatStatus:
          seat?.status === 'WITHDRAWN' ? null : (seat?.status ?? null),
      });
      if (phase === 'REQUESTED')
        // Cambio di circolo finché il posto non è assegnato.
        return void (await tx.freeLessonSeat.update({
          where: { userId },
          data: { partnerId },
        }));
      if (phase !== 'ELIGIBLE')
        throw new ConflictException({
          code: 'FREE_LESSON_NOT_ELIGIBLE',
          message: 'La lezione gratuita non è ancora disponibile.',
          phase,
          missing,
        });
      const data = {
        partnerId,
        status: 'REQUESTED',
        lessonId: null,
        assignedAt: null,
        coachSharingAcceptedAt: new Date(),
        requestedAt: new Date(),
      };
      await tx.freeLessonSeat.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
    });
    return this.view(userId);
  }

  /** Rinuncia prima della lezione: il posto torna libero, il beneficio resta. */
  async withdraw(userId: string, now = new Date()) {
    await this.requireEnabled(userId);
    await this.prisma.$transaction(async (tx) => {
      await lockCalibration(tx, userId);
      const seat = await tx.freeLessonSeat.findUnique({
        where: { userId },
        include: { lesson: { select: { startsAt: true } } },
      });
      if (!seat || seat.status === 'WITHDRAWN') return;
      if (seat.status !== 'REQUESTED' && seat.status !== 'ASSIGNED')
        throw new ConflictException('La lezione si è già svolta');
      if (seat.lesson && seat.lesson.startsAt <= now)
        throw new ConflictException('La lezione è già iniziata');
      await tx.freeLessonSeat.update({
        where: { userId },
        data: { status: 'WITHDRAWN', lessonId: null, assignedAt: null },
      });
      if (seat.status === 'ASSIGNED') await releaseCalibration(tx, userId);
    });
    return this.view(userId);
  }
}
