import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { ProgramHorizon } from '@prisma/client';
import { ConsentsService } from '../../src/consents/consents.service';
import { FeatureFlagsService } from '../../src/features/feature-flags.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RankingService } from '../../src/ranking/ranking.service';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

const DAY_MS = 86_400_000;

describe('Ranking PF1-PF4 on PostgreSQL', () => {
  let prisma: PrismaService;
  let service: RankingService;
  const users: string[] = [];
  const areaIds: string[] = [];
  const originalUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.DATABASE_URL = getRequiredTestDatabaseUrl();
    await ensureTestDatabaseExists(process.env.DATABASE_URL);
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: process.env,
      stdio: 'pipe',
    });
    prisma = new PrismaService();
    await prisma.$connect();
    service = new RankingService(
      prisma,
      new FeatureFlagsService(prisma),
      new ConsentsService(prisma),
    );
    for (const name of ['Tecnica', 'Fisico'])
      areaIds.push(
        (
          await prisma.area.create({
            data: { name: `ranking-${name}-${randomUUID()}` },
          })
        ).id,
      );
    await prisma.rankingConfig.deleteMany({});
  }, 60000);

  afterAll(async () => {
    if (prisma) {
      await prisma.featureFlag.deleteMany({
        where: { key: 'platform_ranking' },
      });
      await prisma.rankingConfigChange.deleteMany({});
      await prisma.rankingConfig.deleteMany({});
      await prisma.consent.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.area.deleteMany({ where: { id: { in: areaIds } } });
      await prisma.$disconnect();
    }
    process.env.DATABASE_URL = originalUrl;
  });

  const setFlag = (enabled: boolean) =>
    prisma.featureFlag.upsert({
      where: { key: 'platform_ranking' },
      create: {
        key: 'platform_ranking',
        description: 'test',
        enabled,
        rolloutPercent: 100,
      },
      update: { enabled, rolloutPercent: 100 },
    });

  type Scale = { min: number; max: number };
  const HUNDRED: Scale = { min: 0, max: 100 };

  const evaluate = (
    userId: string,
    sequence: number,
    scale: Scale,
    score: number,
  ) =>
    prisma.assessmentEvaluation.create({
      data: {
        userId,
        sequence,
        status: 'CONSOLIDATED',
        summary: 's',
        overallConfidence: 80,
        minScore: scale.min,
        maxScore: scale.max,
        provider: 'stub',
        model: 'stub',
        promptHash: 'h',
        inputJson: {},
        outputJson: {},
        areas: {
          create: areaIds.map((areaId) => ({
            areaId,
            score,
            confidence: 80,
            rationale: 'r',
            evidenceGaps: [],
          })),
        },
      },
    });

  /**
   * Atleta con valutazione (R = `real` su tutte le aree, nella scala
   * `scale`) e scenari per gli orizzonti dati; `paid` crea l'abbonamento
   * con accesso, `expired` uno scaduto. Con `scenarioScale` gli scenari
   * vengono da una valutazione precedente con quell'altra scala.
   */
  const athlete = async (input: {
    firstName: string;
    lastName?: string;
    real: number;
    potential: Partial<Record<ProgramHorizon, number>>;
    paid?: ProgramHorizon;
    expired?: boolean;
    scale?: Scale;
    scenarioScale?: Scale;
  }) => {
    const user = await prisma.user.create({
      data: {
        email: `ranking-${randomUUID()}@example.test`,
        password: 'x',
        role: 'USER',
        firstName: input.firstName,
        lastName: input.lastName ?? null,
      },
    });
    users.push(user.id);
    const scale = input.scale ?? HUNDRED;
    // Gli scenari restano legati alla valutazione da cui sono nati.
    const evaluation = await evaluate(
      user.id,
      1,
      input.scenarioScale ?? scale,
      input.real,
    );
    if (input.scenarioScale) await evaluate(user.id, 2, scale, input.real);
    await prisma.potentialScenario.createMany({
      data: Object.entries(input.potential).flatMap(([horizon, value]) =>
        areaIds.map((areaId) => ({
          userId: user.id,
          evaluationId: evaluation.id,
          areaId,
          horizon: horizon as ProgramHorizon,
          current: input.real,
          value,
          confidence: 60,
          assumptions: {},
          engine: 'ai-potential',
          engineVersion: '1',
          provisional: true,
        })),
      ),
    });
    if (input.paid)
      await prisma.subscription.create({
        data: {
          userId: user.id,
          horizon: input.paid,
          billingCycle: 'MONTHLY',
          status: input.expired ? 'EXPIRED' : 'ACTIVE',
          provider: 'STUB',
          amountCents: 1000,
          currency: 'EUR',
          entitlementEndAt: new Date(
            Date.now() + (input.expired ? -1 : 30) * DAY_MS,
          ),
        },
      });
    return user.id;
  };

  const ranked = async (userId: string) => {
    const view = await service.view(userId);
    if (view.status !== 'RANKED')
      throw new Error(`Atleta non in classifica: ${view.status}`);
    return view;
  };

  it('ranks paid athletes by the potential of the paid horizon, names only with consent', async () => {
    await setFlag(false);
    const mario = await athlete({
      firstName: 'Mario Luigi',
      lastName: 'Rossi',
      real: 90,
      // Paga 6 mesi: vale P6, non P3.
      potential: { PROGRAM_3M: 91, PROGRAM_6M: 99 },
      paid: 'PROGRAM_6M',
    });
    expect(await service.view(mario)).toEqual({ status: 'OFF' });
    await setFlag(true);
    const bea = await athlete({
      firstName: 'Beatrice',
      lastName: 'Rizzo',
      real: 92,
      potential: { PROGRAM_3M: 94 },
      paid: 'PROGRAM_3M',
    });
    const free = await athlete({
      firstName: 'Franco',
      real: 95,
      potential: { PROGRAM_6M: 99 },
    });
    const otherHorizon = await athlete({
      firstName: 'Ugo',
      real: 95,
      potential: { PROGRAM_3M: 99 },
      paid: 'PROGRAM_12M',
    });
    const ended = await athlete({
      firstName: 'Elsa',
      real: 95,
      potential: { PROGRAM_3M: 99 },
      paid: 'PROGRAM_3M',
      expired: true,
    });

    const view = await ranked(mario);
    // 0,6 · 90 + 0,4 · 99 = 93,6 contro 0,6 · 92 + 0,4 · 94 = 92,8.
    expect(view).toMatchObject({
      band: 'PF1',
      bandText: 'I giocatori più completi',
      real: 90,
      potential: 99,
      horizon: 'PROGRAM_6M',
      months: 6,
      weights: { real: 60, potential: 40 },
      announce: true,
      visible: false,
    });
    const beaView = await ranked(bea);
    expect(beaView.position).toBe(view.position + 1);
    const names = (v: typeof view) =>
      Object.fromEntries(v.board.map((r) => [r.position, r.name]));
    expect(names(view)[view.position]).toBe('Mario (tu)');
    expect(names(view)[beaView.position]).toBe('Atleta');
    expect(names(beaView)[view.position]).toBe('Atleta');

    await service.setVisibility(bea, true, { source: 'test' });
    expect(names(await ranked(mario))[beaView.position]).toBe('Beatrice R.');
    await service.setVisibility(bea, false, { source: 'test' });
    expect(names(await ranked(mario))[beaView.position]).toBe('Atleta');

    for (const id of [free, otherHorizon, ended])
      expect(await service.view(id)).toMatchObject({
        status: 'NOT_RANKED',
        subscribed: id === otherHorizon,
      });
    const pf1 = view.bands.find((b) => b.code === 'PF1')!;
    expect(pf1).toMatchObject({ min: 80, me: true });
    expect(pf1.size).toBe(view.size);
    expect(view.example?.athletes.map((a) => a.band)).toEqual(['PF2', 'PF3']);
  });

  it('compares real and potential on 0-100 when evaluations use different scales', async () => {
    await setFlag(true);
    await prisma.rankingConfig.deleteMany({});
    // Ultima valutazione su 0-10 (7,5 → 75), scenari della precedente su
    // 0-100 (85): punteggio 0,6 · 75 + 0,4 · 85 = 79.
    const tenths = await athlete({
      firstName: 'Teo',
      real: 7.5,
      scale: { min: 0, max: 10 },
      potential: { PROGRAM_3M: 85 },
      scenarioScale: HUNDRED,
      paid: 'PROGRAM_3M',
    });
    // Tutto su 0-100: 0,6 · 73 + 0,4 · 88 = 79, pari punteggio. Lo spareggio
    // guarda il reale su 0-100 (75 contro 73), non il grezzo (7,5 contro 73).
    const percent = await athlete({
      firstName: 'Pia',
      real: 73,
      potential: { PROGRAM_3M: 88 },
      paid: 'PROGRAM_3M',
    });
    // Reale su 0-100 (70), scenari di una valutazione su 0-10 (8 → 80).
    const mixed = await athlete({
      firstName: 'Max',
      real: 70,
      potential: { PROGRAM_3M: 8 },
      scenarioScale: { min: 0, max: 10 },
      paid: 'PROGRAM_3M',
    });

    const teo = await ranked(tenths);
    const pia = await ranked(percent);
    expect(teo).toMatchObject({ band: 'PF2', real: 75, potential: 85 });
    expect(pia).toMatchObject({ band: 'PF2', real: 73, potential: 88 });
    expect(pia.position).toBe(teo.position + 1);
    expect(teo.board.find((r) => r.me)).toMatchObject({
      real: 75,
      potential: 85,
    });
    // 0,6 · 70 + 0,4 · 80 = 74: PF2, con il potenziale non schiacciato a 70.
    expect(await ranked(mixed)).toMatchObject({
      band: 'PF2',
      real: 70,
      potential: 80,
    });
  });

  it('announces a band once and again when it changes with the admin config', async () => {
    await setFlag(true);
    const anna = await athlete({
      firstName: 'Anna',
      real: 90,
      potential: { PROGRAM_6M: 96 },
      paid: 'PROGRAM_6M',
    });
    const admin = (
      await prisma.user.create({
        data: {
          email: `ranking-admin-${randomUUID()}@example.test`,
          password: 'x',
          role: 'ADMIN',
        },
      })
    ).id;
    users.push(admin);
    expect(await ranked(anna)).toMatchObject({ band: 'PF1', announce: true });
    await service.announced(anna, 'PF1');
    expect(await ranked(anna)).toMatchObject({ announce: false });

    await expect(
      service.updateConfig(
        {
          realWeight: 70,
          potentialWeight: 40,
          pf1Min: 80,
          pf2Min: 66,
          pf3Min: 50,
        },
        admin,
      ),
    ).rejects.toThrow('devono sommare 100');
    const saved = await service.updateConfig(
      {
        realWeight: 100,
        potentialWeight: 0,
        pf1Min: 95,
        pf2Min: 85,
        pf3Min: 50,
      },
      admin,
    );
    expect(saved.config).toEqual({
      realWeight: 100,
      potentialWeight: 0,
      pf1Min: 95,
      pf2Min: 85,
      pf3Min: 50,
    });
    expect(saved.changes[0]).toMatchObject({
      before: null,
      after: { realWeight: 100, pf1Min: 95 },
    });
    // Solo il reale (90) conta: scende in PF2 e il pop-up torna.
    expect(await ranked(anna)).toMatchObject({
      band: 'PF2',
      announce: true,
      weights: { real: 100, potential: 0 },
    });
  });
});
