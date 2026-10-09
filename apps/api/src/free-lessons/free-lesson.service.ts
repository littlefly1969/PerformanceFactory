import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { Prisma } from '@prisma/client';
import {
  checkRule,
  loadActivePolicy,
} from '../discovery/calibration/confidence-policy';
import { lockCalibration } from '../discovery/calibration/lesson-evidence';
import {
  lessonClubs,
  settleCalibration,
} from '../discovery/calibration/lesson-gate';
import { FeatureFlagsService } from '../features/feature-flags.service';
import { PrismaService } from '../prisma/prisma.service';
import { loadFreeLessonSettings, syncCredits } from './free-lesson-config';
import { lessonEligibility } from './free-lesson-rules';
import { holdCalibration, releaseCalibration } from './lesson-hold';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Le due verifiche della lezione (PF-FS-PREPAYWALL §6.2) sull'ultima
 * valutazione: regola di eleggibilità in vigore, livello, circoli. Restituisce
 * anche la versione della regola e la valutazione usate, da registrare.
 */
async function checkLesson(db: Db, userId: string) {
  const [calibration, seat, clubs, policy, latest] = await Promise.all([
    db.athleteCalibration.findUnique({
      where: { userId },
      select: { status: true, lessonDeclinedAt: true },
    }),
    db.freeLessonSeat.findUnique({ where: { userId } }),
    lessonClubs(db),
    loadActivePolicy(db, 'LESSON_ELIGIBILITY'),
    db.assessmentEvaluation.findFirst({
      where: { userId },
      orderBy: { sequence: 'desc' },
      select: {
        id: true,
        overallConfidence: true,
        areas: { select: { areaId: true, confidence: true } },
      },
    }),
  ]);
  const eligibilityMet =
    !!latest &&
    checkRule(policy, {
      overallConfidence: latest.overallConfidence,
      drivers: latest.areas,
    }).met;
  return {
    seat,
    clubs,
    policy,
    evaluationId: latest?.id ?? null,
    ...lessonEligibility({
      calibrationStatus: calibration?.status ?? null,
      eligibilityMet,
      clubs: clubs.length,
      seatStatus: seat?.status ?? null,
      declined: !!calibration?.lessonDeclinedAt,
    }),
  };
}

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
  ) {}

  private async requireEnabled(userId: string) {
    if (!(await this.flags.isEnabled('free_lesson', userId)))
      throw new ForbiddenException('La lezione gratuita non è attiva');
  }

  async view(userId: string) {
    if (!(await this.flags.isEnabled('free_lesson', userId)))
      return { enabled: false as const };
    const settings = await loadFreeLessonSettings(this.prisma);
    const credits = await syncCredits(this.prisma, userId, settings);
    const [attribution, check] = await Promise.all([
      this.prisma.userAttribution.findUnique({
        where: { userId },
        select: { partnerId: true },
      }),
      checkLesson(this.prisma, userId),
    ]);
    const { phase, missing, clubs } = check;
    const seat = check.seat
      ? await this.prisma.freeLessonSeat.findUniqueOrThrow({
          where: { userId },
          include: {
            partner: { select: { name: true, city: true } },
            lesson: { select: { startsAt: true, durationMinutes: true } },
          },
        })
      : null;
    const clubId = clubs.some((c) => c.id === attribution?.partnerId)
      ? attribution!.partnerId
      : null;
    if (phase === 'ELIGIBLE')
      await this.analytics.trackServerOnce('lesson_eligible', {
        userId,
        onceKey: userId,
        properties: {
          club_id: clubId ?? '',
          eligibility_policy_version: check.policy.version,
        },
      });
    return {
      enabled: true as const,
      phase,
      missing,
      // Solo progresso visivo: i crediti non sbloccano la lezione (OP-01).
      credits: { balance: credits, toUnlock: settings.creditsToUnlock },
      earn: {
        initialAssessment: settings.creditsInitialAssessment,
        // Un micro-test è un passo della calibrazione e vale come un round.
        calibrationRound: settings.creditsCalibrationRound,
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
    };
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
    await this.prisma.$transaction(async (tx) => {
      await lockCalibration(tx, userId);
      const { seat, phase, missing, policy, evaluationId } = await checkLesson(
        tx,
        userId,
      );
      if (seat?.status === 'REQUESTED' && seat.partnerId === partnerId) return;
      if (phase === 'REQUESTED')
        // Cambio di circolo finché il posto non è assegnato.
        return void (await tx.freeLessonSeat.update({
          where: { userId },
          data: { partnerId },
        }));
      // Dopo un ritiro o una rinuncia l'atleta può ancora cambiare idea.
      if (phase !== 'ELIGIBLE' && phase !== 'DECLINED')
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
        eligibilityPolicyId: policy.id,
        eligibilityEvaluationId: evaluationId,
      };
      await tx.freeLessonSeat.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      await tx.athleteCalibration.update({
        where: { userId },
        data: { lessonDeclinedAt: null },
      });
      // Dalla richiesta la lezione è il passaggio che chiude R e P.
      await holdCalibration(tx, userId);
      await this.analytics.trackServer(
        'lesson_requested',
        {
          userId,
          properties: {
            club_id: partnerId,
            eligibility_policy_version: policy.version,
          },
        },
        tx,
      );
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
      await releaseCalibration(tx, userId);
      // Senza lezione basta la regola di confidence: R può consolidarsi ora.
      await settleCalibration(tx, userId, now);
    });
    return this.view(userId);
  }

  /**
   * L'atleta eleggibile sceglie di non fare la lezione (AT-18): R si consolida
   * con la sola regola di confidence e il percorso verso il paywall prosegue.
   * Reversibile con una richiesta finché R è aperta.
   */
  async decline(userId: string, now = new Date()) {
    await this.requireEnabled(userId);
    await this.prisma.$transaction(async (tx) => {
      await lockCalibration(tx, userId);
      const { phase } = await checkLesson(tx, userId);
      if (phase === 'DECLINED') return;
      if (phase !== 'ELIGIBLE')
        throw new ConflictException({
          code: 'FREE_LESSON_NOT_ELIGIBLE',
          message: "Non c'è una lezione gratuita da rifiutare.",
          phase,
        });
      await tx.athleteCalibration.update({
        where: { userId },
        data: { lessonDeclinedAt: now },
      });
      await this.analytics.trackServer('lesson_declined', { userId }, tx);
      await settleCalibration(tx, userId, now);
    });
    return this.view(userId);
  }
}
