import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
import { PROGRAM_HORIZON_MONTHS as HORIZON_MONTHS } from '../../payments/payment-plans';
import { AiProposalProviderService } from '../../ai-orchestrator/proposal-provider.service';
import { loadActiveAssessmentPrompt } from '../../ai-orchestrator/assessment-prompts';
import { POTENTIAL_CRITERIA } from '../../ai-orchestrator/potential-generation';
import { requireAiConsent } from '../assessment-evaluation';
import { revealGaps } from './reveal-gap';

const HORIZONS = Object.keys(HORIZON_MONTHS) as ProgramHorizon[];

/** Motore AI del potenziale, versionato con i criteri entro cui formula P. */
export const POTENTIAL_ENGINE = {
  key: 'ai-potential',
  version: POTENTIAL_CRITERIA.version,
  provisional: !POTENTIAL_CRITERIA.approved,
};

/** Generazione in corso per l'atleta: oltre questo tempo è interrotta. */
const LEASE_MS = 2 * 60 * 1000;

type ConsolidatedEvaluation = Prisma.AssessmentEvaluationGetPayload<{
  include: { areas: { include: { area: { select: { name: true } } } } };
}>;

export const isProgramHorizon = (value: unknown): value is ProgramHorizon =>
  HORIZONS.includes(value as ProgramHorizon);

/** Messaggio unico: scegliere un percorso richiede il reveal completo. */
const NOT_REVEALED = 'Gli scenari si sbloccano a calibrazione completata';

/**
 * Scenari P3/P6/P12 a calibrazione chiusa e scelta dell'orizzonte (gap 1.8,
 * 1.9). L'AI formula P una volta per valutazione consolidata, entro criteri
 * versionati (§7.1, §7.3); gli scenari già mostrati non cambiano con un nuovo
 * prompt o una nuova versione dei criteri. Mostrarli con i gap rende l'atleta
 * ACTIVATED (A10); solo allora la scelta dell'orizzonte porta il percorso a
 * PAYWALL_READY (AT-28).
 */
@Injectable()
export class ScenariosService {
  private readonly logger = new Logger(ScenariosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly analytics: AnalyticsService,
    private readonly ai: AiProposalProviderService,
  ) {}

  /**
   * Vista per l'atleta, o null se la funzione non è attiva o la calibrazione
   * è aperta. Mentre l'AI scrive gli scenari la vista è PENDING; se il
   * provider fallisce è UNAVAILABLE e la prossima apertura riprova (OP-09).
   */
  async view(userId: string, orderedAreas: string[]) {
    if (!(await this.ready(userId))) return null;
    const evaluation = await this.consolidated(userId);
    if (!evaluation) return null;
    let first = await this.firstScenario(evaluation.id);
    if (!first) {
      const outcome = await this.generate(userId, evaluation);
      if (outcome !== 'DONE') return { status: outcome };
      first = await this.firstScenario(evaluation.id);
      if (!first) return { status: 'PENDING' as const };
    }
    const [rows, discovery] = await Promise.all([
      this.prisma.potentialScenario.findMany({
        where: {
          evaluationId: evaluation.id,
          engine: first.engine,
          engineVersion: first.engineVersion,
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
          rationale: rationaleOf(r.assumptions),
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
      status: 'READY' as const,
      engine: {
        key: first.engine,
        version: first.engineVersion,
        provisional: first.provisional,
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
  private consolidated(userId: string): Promise<ConsolidatedEvaluation | null> {
    return this.prisma.assessmentEvaluation.findFirst({
      where: { userId, status: 'CONSOLIDATED' },
      orderBy: { sequence: 'desc' },
      include: { areas: { include: { area: { select: { name: true } } } } },
    });
  }

  /** Primo scenario della valutazione: fissa motore e versione mostrati. */
  private firstScenario(evaluationId: string) {
    return this.prisma.potentialScenario.findFirst({
      where: { evaluationId },
      orderBy: { computedAt: 'asc' },
      select: { engine: true, engineVersion: true, provisional: true },
    });
  }

  /**
   * L'AI scrive P3/P6/P12 sotto lease per atleta: richieste concorrenti non
   * chiamano il provider due volte. La calibrazione è chiusa, quindi il suo
   * lease è libero. Il salvataggio ricontrolla sotto lock che nessun altro
   * abbia già scritto gli scenari della stessa valutazione.
   */
  private async generate(
    userId: string,
    evaluation: ConsolidatedEvaluation,
  ): Promise<'DONE' | 'PENDING' | 'UNAVAILABLE'> {
    const lease = new Date();
    const claimed = await this.prisma.athleteCalibration.updateMany({
      where: {
        userId,
        OR: [
          { operationAt: null },
          { operationAt: { lt: new Date(lease.getTime() - LEASE_MS) } },
        ],
      },
      data: { operationAt: lease },
    });
    if (!claimed.count) return 'PENDING';
    try {
      await requireAiConsent(this.prisma, userId);
      const [prompt, daysPerWeek] = await Promise.all([
        loadActiveAssessmentPrompt(this.prisma, 'POTENTIAL'),
        this.daysPerWeek(userId),
      ]);
      const result = await this.ai.generatePotential({
        ...prompt,
        scale: { min: evaluation.minScore, max: evaluation.maxScore },
        level: evaluation.level,
        levelConfidence: evaluation.levelConfidence,
        daysPerWeek,
        drivers: evaluation.areas.map((a) => ({
          areaId: a.areaId,
          name: driverName(a.area.name),
          score: a.score,
          confidence: a.confidence,
          commitment: a.commitment,
          rationale: a.rationale,
          evidenceGaps: a.evidenceGaps as string[],
        })),
      });
      const current = new Map(evaluation.areas.map((a) => [a.areaId, a.score]));
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`potential:${evaluation.id}`}))`;
        if (
          await tx.potentialScenario.count({
            where: { evaluationId: evaluation.id },
          })
        )
          return;
        await tx.potentialScenario.createMany({
          data: result.scenarios.map((s) => ({
            userId,
            evaluationId: evaluation.id,
            areaId: s.areaId,
            horizon: s.horizon,
            current: current.get(s.areaId)!,
            value: s.value,
            confidence: s.confidence,
            assumptions: {
              months: HORIZON_MONTHS[s.horizon],
              rationale: s.rationale,
              criteria: result.criteria,
              promptVersionId: prompt.promptVersionId,
              provider: result.provider,
              model: result.model,
              promptHash: result.promptHash,
            },
            engine: POTENTIAL_ENGINE.key,
            engineVersion: POTENTIAL_ENGINE.version,
            provisional: POTENTIAL_ENGINE.provisional,
          })),
        });
        await this.analytics.trackServerOnce(
          'potential_generated',
          {
            userId,
            onceKey: evaluation.id,
            properties: {
              engine: POTENTIAL_ENGINE.key,
              engineVersion: POTENTIAL_ENGINE.version,
            },
          },
          tx,
        );
      });
      return 'DONE';
    } catch (error) {
      this.logger.warn(
        `Scenari non generati per la valutazione ${evaluation.id}: ${
          error instanceof Error ? error.message : 'errore sconosciuto'
        }`,
      );
      return 'UNAVAILABLE';
    } finally {
      await this.prisma.athleteCalibration.updateMany({
        where: { userId, operationAt: lease },
        data: { operationAt: null },
      });
    }
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

/** Motivazione dell'AI salvata con lo scenario; assente negli scenari storici. */
function rationaleOf(assumptions: Prisma.JsonValue) {
  const value = (assumptions as { rationale?: unknown } | null)?.rationale;
  return typeof value === 'string' ? value : null;
}
