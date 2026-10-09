import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, ProgramHorizon } from '@prisma/client';
import { AnalyticsService } from '../../analytics/analytics.service';
import { FeatureFlagsService } from '../../features/feature-flags.service';
import { performanceDriverName as driverName } from '../../performance/performance-display';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OPERATIONAL_ROLES,
  loadOperationalTemplates,
} from '../assessment-configuration';
import { isCalibrationClosed } from '../calibration/calibration-rules';
import { PROGRAM_HORIZON_WEEKS } from '../program-horizon';
import { OPEN_SUBSCRIPTION_STATUSES } from '../../payments/checkout.service';
import { revealGaps } from './reveal-gap';
import {
  ACTIVE_POTENTIAL_ENGINE,
  HORIZON_MONTHS,
  PotentialEngine,
} from './potential-engine';

const HORIZONS = Object.keys(HORIZON_MONTHS) as ProgramHorizon[];

export const isProgramHorizon = (value: unknown): value is ProgramHorizon =>
  HORIZONS.includes(value as ProgramHorizon);

/** Messaggio unico: scegliere un percorso richiede il reveal completo. */
const NOT_REVEALED = 'Gli scenari si sbloccano a calibrazione completata';

/**
 * Scenari P3/P6/P12 a calibrazione chiusa e scelta dell'orizzonte (gap 1.8,
 * 1.9). Gli scenari si calcolano una volta per valutazione consolidata e
 * motore. Mostrarli con i gap rende l'atleta ACTIVATED (A10); solo allora la
 * scelta dell'orizzonte porta il percorso a PAYWALL_READY (§7.3, AT-28).
 */
@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Motore in uso; sostituibile senza toccare il servizio. */
  engine: PotentialEngine = ACTIVE_POTENTIAL_ENGINE;

  /** Vista per l'atleta, o null se la funzione non è attiva o la calibrazione è aperta. */
  async view(userId: string, orderedAreas: string[]) {
    if (!(await this.ready(userId))) return null;
    const evaluation = await this.consolidated(userId);
    if (!evaluation) return null;
    await this.ensure(userId, evaluation);
    const [rows, discovery] = await Promise.all([
      this.prisma.potentialScenario.findMany({
        where: {
          evaluationId: evaluation.id,
          engine: this.engine.key,
          engineVersion: this.engine.version,
        },
        include: { area: { select: { name: true } } },
      }),
      this.prisma.athleteDiscovery.findUnique({
        where: { userId },
        select: { programHorizon: true },
      }),
    ]);
    const position = (id: string) => {
      const index = orderedAreas.indexOf(id);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    const horizons = HORIZONS.map((horizon) => {
      const drivers = rows
        .filter((r) => r.horizon === horizon)
        .sort((a, b) => position(a.areaId) - position(b.areaId));
      return {
        horizon,
        months: HORIZON_MONTHS[horizon],
        drivers: drivers.map((r) => ({
          id: r.areaId,
          name: driverName(r.area.name),
          current: r.current,
          potential: r.value,
          confidence: r.confidence,
        })),
        gap: revealGaps(
          drivers.map((r) => ({
            areaName: r.area.name,
            current: r.current,
            potential: r.value,
          })),
        ),
      };
    });
    if (rows.length) await this.activate(userId, evaluation.id);
    return {
      engine: {
        key: this.engine.key,
        version: this.engine.version,
        provisional: this.engine.provisional,
      },
      evaluationId: evaluation.id,
      scale: { min: evaluation.minScore, max: evaluation.maxScore },
      computedAt: rows[0]?.computedAt ?? null,
      selectedHorizon: discovery?.programHorizon ?? null,
      horizons,
    };
  }

  /**
   * R consolidata, P e gap sono nella risposta mostrata all'atleta: diventa
   * ACTIVATED una volta sola, con `gap_displayed` per valutazione.
   */
  private async activate(userId: string, evaluationId: string) {
    const now = new Date();
    await this.prisma.athleteDiscovery.updateMany({
      where: { userId, activatedAt: null },
      data: { activatedAt: now },
    });
    await this.analytics.trackServerOnce('gap_displayed', {
      userId,
      onceKey: evaluationId,
    });
  }

  /**
   * Prima apertura del paywall (§7.3): solo dopo la scelta dell'orizzonte,
   * quindi dopo aver visto R, P e gap (AT-28). Le aperture successive non
   * contano di nuovo.
   */
  async paywallViewed(userId: string) {
    const calibration = await this.prisma.athleteCalibration.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (calibration?.status !== 'PAYWALL_READY')
      throw new ConflictException('Scegli prima il tuo percorso');
    const first = await this.prisma.athleteDiscovery.updateMany({
      where: { userId, paywallViewedAt: null },
      data: { paywallViewedAt: new Date() },
    });
    if (first.count)
      await this.analytics.trackServerOnce('paywall_viewed', {
        userId,
        onceKey: userId,
      });
  }

  /**
   * Salva l'orizzonte scelto dopo il reveal: si può cambiare finché non c'è
   * un abbonamento pagato; un checkout ancora aperto viene sostituito al
   * prossimo avvio (#14).
   */
  async select(userId: string, horizon: unknown) {
    if (!isProgramHorizon(horizon))
      throw new BadRequestException('Orizzonte non valido');
    if (!(await this.ready(userId))) throw new ConflictException(NOT_REVEALED);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Stesso lock del checkout: scelta e pagamento non si incrociano.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pf-checkout:${userId}`}, 0))`;
      const paid = await tx.subscription.count({
        where: {
          userId,
          status: {
            in: OPEN_SUBSCRIPTION_STATUSES.filter(
              (s) => s !== 'CHECKOUT_PENDING',
            ),
          },
        },
      });
      if (paid)
        throw new ConflictException(
          'Il percorso è già attivo: l’orizzonte non si può cambiare',
        );
      const activated = await tx.athleteDiscovery.count({
        where: { userId, activatedAt: { not: null } },
      });
      if (!activated) throw new ConflictException(NOT_REVEALED);
      const changed = await tx.athleteCalibration.updateMany({
        where: {
          userId,
          status: { in: ['CALIBRATION_COMPLETED', 'PAYWALL_READY'] },
        },
        data: { status: 'PAYWALL_READY' },
      });
      if (!changed.count) throw new ConflictException(NOT_REVEALED);
      await tx.athleteDiscovery.update({
        where: { userId },
        data: {
          programHorizon: horizon,
          horizonSelectedAt: now,
          programDurationWeeks: PROGRAM_HORIZON_WEEKS[horizon],
        },
      });
      await this.analytics.trackServer(
        'program_horizon_selected',
        { userId, properties: { horizon } },
        tx,
      );
    });
  }

  private async ready(userId: string) {
    const calibration = await this.prisma.athleteCalibration.findUnique({
      where: { userId },
      select: { status: true },
    });
    return (
      !!calibration &&
      isCalibrationClosed(calibration.status) &&
      (await this.flags.isEnabled('potential_scenarios', userId))
    );
  }

  /** Ultima valutazione consolidata: P si calcola solo su R chiusa (A3.9). */
  private consolidated(userId: string) {
    return this.prisma.assessmentEvaluation.findFirst({
      where: { userId, status: 'CONSOLIDATED' },
      orderBy: { sequence: 'desc' },
      include: { areas: true },
    });
  }

  private async ensure(
    userId: string,
    evaluation: NonNullable<
      Awaited<ReturnType<ScenariosService['consolidated']>>
    >,
  ) {
    const exists = await this.prisma.potentialScenario.count({
      where: {
        evaluationId: evaluation.id,
        engine: this.engine.key,
        engineVersion: this.engine.version,
      },
    });
    if (exists) return;
    const scenarios = this.engine.compute({
      scale: { min: evaluation.minScore, max: evaluation.maxScore },
      level: evaluation.level,
      levelConfidence: evaluation.levelConfidence,
      daysPerWeek: await this.daysPerWeek(userId),
      drivers: evaluation.areas.map((a) => ({
        areaId: a.areaId,
        score: a.score,
        confidence: a.confidence,
        commitment: a.commitment,
      })),
    });
    // Due richieste concorrenti calcolano lo stesso risultato: vale il primo.
    const created = await this.prisma.potentialScenario.createMany({
      data: scenarios.map((s) => ({
        userId,
        evaluationId: evaluation.id,
        areaId: s.areaId,
        horizon: s.horizon,
        current: s.current,
        value: s.value,
        confidence: s.confidence,
        assumptions: s.assumptions as Prisma.InputJsonObject,
        engine: this.engine.key,
        engineVersion: this.engine.version,
        provisional: this.engine.provisional,
      })),
      skipDuplicates: true,
    });
    if (created.count)
      await this.analytics.trackServerOnce('potential_generated', {
        userId,
        onceKey: `${evaluation.id}:${this.engine.key}:${this.engine.version}`,
        properties: {
          engine: this.engine.key,
          engineVersion: this.engine.version,
        },
      });
  }

  /** Giorni a settimana dalla domanda operativa dell'assessment, se presente. */
  private async daysPerWeek(userId: string) {
    const [operational, discovery] = await Promise.all([
      loadOperationalTemplates(this.prisma),
      this.prisma.athleteDiscovery.findUnique({
        where: { userId },
        select: { assessmentAnswers: true },
      }),
    ]);
    const answers = (discovery?.assessmentAnswers ?? {}) as Record<
      string,
      unknown
    >;
    const template = operational.find(
      (q) => q.key === OPERATIONAL_ROLES.TRAINING_AVAILABILITY_DAYS,
    );
    const days = Number(template ? answers[template.id] : NaN);
    return Number.isInteger(days) && days >= 1 && days <= 7 ? days : null;
  }
}
