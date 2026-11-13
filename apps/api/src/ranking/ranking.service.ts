import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ProgramHorizon, UserRole } from '@prisma/client';
import { ConsentsService } from '../consents/consents.service';
import { globalR } from '../discovery/athlete-profile';
import { FeatureFlagsService } from '../features/feature-flags.service';
import { PROGRAM_HORIZON_MONTHS } from '../payments/payment-plans';
import { hasEntitlement } from '../payments/subscription-transitions';
import { PrismaService } from '../prisma/prisma.service';
import { RANKING_VISIBILITY_CONSENT } from './ranking-consent';
import {
  BAND_TEXT,
  DEFAULT_RANKING_CONFIG,
  RANKING_BANDS,
  bandExample,
  type RankedEntry,
  type RankingBand,
  type RankingConfigValues,
  type RankingEntry,
  boardWindow,
  publicName,
  rankEntries,
  rankingConfigProblems,
  rankingScore,
  toPercent,
} from './ranking-rules';

const CONFIG_ID = 'default';
const configSelect = {
  realWeight: true,
  potentialWeight: true,
  pf1Min: true,
  pf2Min: true,
  pf3Min: true,
} as const;

type ConsentAudit = {
  ipAddress?: string | null;
  userAgent?: string | null;
  source?: string | null;
};

type Population = {
  ranked: RankedEntry[];
  horizons: Map<string, ProgramHorizon>;
};

/**
 * Ranking PF1-PF4 della piattaforma (funzione nuova, fuori Blueprint). Si
 * calcola alla lettura su tutti gli abbonati con accesso al programma: con
 * i numeri dell'MVP basta, quando crescono va salvato a ogni valutazione.
 */
@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly consents: ConsentsService,
  ) {}

  async config(): Promise<RankingConfigValues> {
    const row = await this.prisma.rankingConfig.findUnique({
      where: { id: CONFIG_ID },
      select: configSelect,
    });
    return row ?? { ...DEFAULT_RANKING_CONFIG };
  }

  /**
   * Abbonati con accesso al programma, con reale (R globale dell'ultima
   * valutazione) e potenziale (P dell'orizzonte pagato, dagli scenari più
   * recenti). Senza valutazione o senza P per quell'orizzonte non si entra.
   */
  async population(
    config: RankingConfigValues,
    now = new Date(),
  ): Promise<Population> {
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAYMENT_GRACE'] },
        user: { role: UserRole.USER, isActive: true },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        horizon: true,
        status: true,
        entitlementEndAt: true,
        graceEndsAt: true,
      },
    });
    // Orizzonte pagato: quello dell'abbonamento più recente con accesso.
    const horizons = new Map<string, ProgramHorizon>();
    for (const s of subscriptions)
      if (!horizons.has(s.userId) && hasEntitlement(s, now))
        horizons.set(s.userId, s.horizon);
    const ids = [...horizons.keys()];
    if (!ids.length) return { ranked: [], horizons };
    const [evaluations, scenarios] = await Promise.all([
      this.prisma.assessmentEvaluation.findMany({
        where: { userId: { in: ids } },
        orderBy: [{ userId: 'asc' }, { sequence: 'desc' }],
        distinct: ['userId'],
        select: {
          userId: true,
          overallConfidence: true,
          minScore: true,
          maxScore: true,
          areas: { select: { score: true, confidence: true } },
        },
      }),
      this.prisma.potentialScenario.findMany({
        where: { userId: { in: ids } },
        orderBy: { computedAt: 'desc' },
        select: {
          userId: true,
          evaluationId: true,
          engine: true,
          engineVersion: true,
          horizon: true,
          value: true,
          confidence: true,
          evaluation: { select: { minScore: true, maxScore: true } },
        },
      }),
    ]);
    const entries: RankingEntry[] = [];
    for (const evaluation of evaluations) {
      const scale = { min: evaluation.minScore, max: evaluation.maxScore };
      const real = globalR(
        evaluation.areas,
        evaluation.overallConfidence,
        scale,
      )?.value;
      const paid = horizons.get(evaluation.userId);
      const rows = scenarios.filter(
        (r) => r.userId === evaluation.userId && r.horizon === paid,
      );
      if (real === undefined || !rows.length) continue;
      // Scenari dell'ultima generazione: stessa valutazione e stesso motore.
      const [latest] = rows;
      const group = rows.filter(
        (r) =>
          r.evaluationId === latest.evaluationId &&
          r.engine === latest.engine &&
          r.engineVersion === latest.engineVersion,
      );
      const potentialScale = {
        min: latest.evaluation.minScore,
        max: latest.evaluation.maxScore,
      };
      const p = globalR(
        group.map((r) => ({ score: r.value, confidence: r.confidence })),
        100,
        potentialScale,
      )!.value;
      const realPercent = toPercent(real, scale);
      // P non scende sotto R: il potenziale è dove puoi arrivare da qui.
      const potentialPercent = Math.max(
        realPercent,
        toPercent(p, potentialScale),
      );
      entries.push({
        userId: evaluation.userId,
        real,
        potential: Math.max(p, real),
        score: rankingScore(realPercent, potentialPercent, config),
      });
    }
    return { ranked: rankEntries(entries, config), horizons };
  }

  /** Vista dell'atleta: fascia, posizione, classifica vicina e fasce. */
  async view(userId: string) {
    if (!(await this.flags.isEnabled('platform_ranking', userId)))
      return { status: 'OFF' as const };
    const config = await this.config();
    const [{ ranked, horizons }, visible] = await Promise.all([
      this.population(config),
      this.visibility(userId),
    ]);
    const me = ranked.find((e) => e.userId === userId);
    if (!me)
      return {
        status: 'NOT_RANKED' as const,
        subscribed: horizons.has(userId),
        visible: visible.granted,
      };
    const band = ranked.filter((e) => e.band === me.band);
    const { first, last } = boardWindow(me.position, band.length);
    const rows = band.slice(first - 1, last);
    const ids = rows.map((r) => r.userId);
    const [users, consents, announcement] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.consent.findMany({
        where: {
          userId: { in: ids },
          ...this.currentConsent(),
        },
        select: { userId: true },
      }),
      this.prisma.rankingAnnouncement.findUnique({
        where: { userId },
        select: { band: true },
      }),
    ]);
    const named = new Set(consents.map((c) => c.userId));
    const nameOf = (id: string) => {
      const user = users.find((u) => u.id === id);
      if (id === userId) {
        const first = user?.firstName?.trim().split(/\s+/)[0];
        return first ? `${first} (tu)` : 'Tu';
      }
      if (!named.has(id) || !user) return 'Atleta';
      return publicName(user.firstName, user.lastName) ?? 'Atleta';
    };
    const horizon = horizons.get(userId)!;
    return {
      status: 'RANKED' as const,
      band: me.band,
      bandText: BAND_TEXT[me.band],
      position: me.position,
      size: band.length,
      real: me.real,
      potential: me.potential,
      horizon,
      months: PROGRAM_HORIZON_MONTHS[horizon],
      weights: {
        real: config.realWeight,
        potential: config.potentialWeight,
      },
      board: rows.map((r) => ({
        position: r.position,
        name: nameOf(r.userId),
        real: r.real,
        potential: r.potential,
        me: r.userId === userId,
      })),
      bands: this.bands(ranked, config, me.band),
      example: bandExample(config),
      // Pop-up alla prima fascia dopo il pagamento e a ogni cambio di fascia.
      announce: announcement?.band !== me.band,
      visible: visible.granted,
    };
  }

  private bands(
    ranked: RankedEntry[],
    config: RankingConfigValues,
    mine: RankingBand | null,
  ) {
    const min: Record<RankingBand, number> = {
      PF1: config.pf1Min,
      PF2: config.pf2Min,
      PF3: config.pf3Min,
      PF4: 0,
    };
    return RANKING_BANDS.map((code) => ({
      code,
      text: BAND_TEXT[code],
      min: min[code],
      size: ranked.filter((e) => e.band === code).length,
      me: code === mine,
    }));
  }

  /** Il pop-up della fascia è stato mostrato: non torna finché resta quella. */
  async announced(userId: string, band: string) {
    if (!RANKING_BANDS.includes(band as RankingBand))
      throw new BadRequestException('Fascia non valida');
    await this.prisma.rankingAnnouncement.upsert({
      where: { userId },
      create: { userId, band },
      update: { band, announcedAt: new Date() },
    });
  }

  private currentConsent() {
    return {
      type: RANKING_VISIBILITY_CONSENT.type,
      version: RANKING_VISIBILITY_CONSENT.version,
      documentHash: RANKING_VISIBILITY_CONSENT.documentHash,
      withdrawnAt: null,
    };
  }

  async visibility(userId: string) {
    const active = await this.prisma.consent.findFirst({
      where: { userId, ...this.currentConsent() },
      select: { grantedAt: true },
    });
    return {
      granted: !!active,
      grantedAt: active?.grantedAt ?? null,
      document: RANKING_VISIBILITY_CONSENT,
    };
  }

  /** Concessione idempotente; la revoca chiude tutte le versioni attive. */
  async setVisibility(userId: string, granted: boolean, audit: ConsentAudit) {
    await this.prisma.$transaction(async (tx) => {
      if (granted) {
        await this.consents.createConsent(
          tx,
          userId,
          RANKING_VISIBILITY_CONSENT,
          audit,
        );
        return;
      }
      await tx.consent.updateMany({
        where: {
          userId,
          type: RANKING_VISIBILITY_CONSENT.type,
          withdrawnAt: null,
        },
        data: { withdrawnAt: new Date() },
      });
    });
    return this.visibility(userId);
  }

  /** Back office: configurazione, fasce di oggi e ultime modifiche. */
  async adminView() {
    const config = await this.config();
    const [{ ranked }, changes] = await Promise.all([
      this.population(config),
      this.prisma.rankingConfigChange.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          before: true,
          after: true,
          createdAt: true,
          actor: { select: { email: true } },
        },
      }),
    ]);
    return {
      config,
      defaults: DEFAULT_RANKING_CONFIG,
      ranked: ranked.length,
      bands: this.bands(ranked, config, null),
      changes: changes.map((c) => ({
        id: c.id,
        before: c.before,
        after: c.after,
        createdAt: c.createdAt,
        actor: c.actor?.email ?? null,
      })),
    };
  }

  async updateConfig(input: RankingConfigValues, actorId: string) {
    const next: RankingConfigValues = {
      realWeight: input.realWeight,
      potentialWeight: input.potentialWeight,
      pf1Min: input.pf1Min,
      pf2Min: input.pf2Min,
      pf3Min: input.pf3Min,
    };
    const problems = rankingConfigProblems(next);
    if (problems.length) throw new BadRequestException(problems.join('. '));
    await this.prisma.$transaction(async (tx) => {
      // Due salvataggi insieme non perdono l'audit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ranking-config'))`;
      const before = await tx.rankingConfig.findUnique({
        where: { id: CONFIG_ID },
        select: configSelect,
      });
      const after = await tx.rankingConfig.upsert({
        where: { id: CONFIG_ID },
        create: { id: CONFIG_ID, ...next, updatedById: actorId },
        update: { ...next, updatedById: actorId },
        select: configSelect,
      });
      await tx.rankingConfigChange.create({
        data: {
          actorId,
          before: before ?? Prisma.DbNull,
          after,
        },
      });
    });
    return this.adminView();
  }
}
