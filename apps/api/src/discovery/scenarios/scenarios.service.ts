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
import {
  ACTIVE_POTENTIAL_ENGINE,
  HORIZON_MONTHS,
  PotentialEngine,
} from './potential-engine';

const HORIZONS = Object.keys(HORIZON_MONTHS) as ProgramHorizon[];

export const isProgramHorizon = (value: unknown): value is ProgramHorizon =>
  HORIZONS.includes(value as ProgramHorizon);

/**
 * Scenari P3/P6/P12 a calibrazione chiusa e scelta dell'orizzonte (gap 1.8,
 * 1.9). Gli scenari si calcolano una volta per valutazione consolidata e
 * motore; la scelta porta il percorso a PAYWALL_READY.
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
      horizons: HORIZONS.map((horizon) => ({
        horizon,
        months: HORIZON_MONTHS[horizon],
        drivers: rows
          .filter((r) => r.horizon === horizon)
          .sort((a, b) => position(a.areaId) - position(b.areaId))
          .map((r) => ({
            id: r.areaId,
            name: driverName(r.area.name),
            current: r.current,
            potential: r.value,
            confidence: r.confidence,
          })),
      })),
    };
  }

  /** Salva l'orizzonte scelto: si può cambiare finché non c'è un abbonamento. */
  async select(userId: string, horizon: unknown) {
    if (!isProgramHorizon(horizon))
      throw new BadRequestException('Orizzonte non valido');
    if (!(await this.ready(userId)))
      throw new ConflictException(
        'Gli scenari si sbloccano a calibrazione completata',
      );
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.athleteCalibration.updateMany({
        where: {
          userId,
          status: { in: ['CALIBRATION_COMPLETED', 'PAYWALL_READY'] },
        },
        data: { status: 'PAYWALL_READY' },
      });
      if (!changed.count)
        throw new ConflictException(
          'Gli scenari si sbloccano a calibrazione completata',
        );
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
    await this.prisma.potentialScenario.createMany({
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
