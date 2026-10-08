import { ConflictException } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import {
  assertProgramAllowed,
  loadCalibrationSettings,
} from '../../src/discovery/calibration/calibration-config';
import { ScenariosService } from '../../src/discovery/scenarios/scenarios.service';
import { FeatureFlagsService } from '../../src/features/feature-flags.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

describe('P3/P6/P12 scenarios and program horizon on PostgreSQL', () => {
  let prisma: PrismaService;
  let service: ScenariosService;
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
    service = new ScenariosService(
      prisma,
      new FeatureFlagsService(prisma),
      new AnalyticsService(prisma),
    );
    for (const name of ['Tecnica', 'Fisico'])
      areaIds.push(
        (
          await prisma.area.create({
            data: { name: `scenari-${name}-${randomUUID()}` },
          })
        ).id,
      );
  }, 60000);

  afterAll(async () => {
    if (prisma) {
      await prisma.featureFlag.deleteMany({
        where: { key: 'potential_scenarios' },
      });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.area.deleteMany({ where: { id: { in: areaIds } } });
      await prisma.$disconnect();
    }
    process.env.DATABASE_URL = originalUrl;
  });

  const setFlag = (enabled: boolean) =>
    prisma.featureFlag.upsert({
      where: { key: 'potential_scenarios' },
      create: {
        key: 'potential_scenarios',
        description: 'test',
        enabled,
        rolloutPercent: 100,
      },
      update: { enabled, rolloutPercent: 100 },
    });

  /** Atleta con calibrazione chiusa e valutazione consolidata. */
  async function athlete(status = 'CALIBRATION_COMPLETED') {
    const user = await prisma.user.create({
      data: {
        email: `scenari-${randomUUID()}@test.local`,
        password: 'unused',
        role: 'USER',
      },
    });
    users.push(user.id);
    await prisma.athleteDiscovery.create({
      data: {
        userId: user.id,
        version: 1,
        configuration: {},
        draft: {},
        phase: 'ASSESSMENT',
      },
    });
    await prisma.athleteCalibration.create({
      data: {
        userId: user.id,
        status,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 86400000),
      },
    });
    const evaluation = {
      summary: 'Sintesi',
      overallConfidence: 75,
      level: 'INTERMEDIATE',
      levelConfidence: 80,
      minScore: 0,
      maxScore: 100,
      provider: 'stub',
      model: 'stub',
      promptHash: 'hash',
      inputJson: {},
      outputJson: {},
    };
    await prisma.assessmentEvaluation.create({
      data: { ...evaluation, userId: user.id, sequence: 1 },
    });
    await prisma.assessmentEvaluation.create({
      data: {
        ...evaluation,
        userId: user.id,
        sequence: 2,
        status: 'CONSOLIDATED',
        areas: {
          create: [
            {
              areaId: areaIds[0],
              score: 40,
              confidence: 80,
              commitment: 'HIGH',
            },
            {
              areaId: areaIds[1],
              score: 85,
              confidence: 72,
              commitment: 'LOW',
            },
          ].map((a) => ({ ...a, rationale: 'r', evidenceGaps: [] })),
        },
      },
    });
    return user.id;
  }

  it('stays hidden while the flag is off or the calibration is open', async () => {
    await setFlag(false);
    const userId = await athlete();
    expect(await service.view(userId, areaIds)).toBeNull();
    await expect(service.select(userId, 'PROGRAM_6M')).rejects.toThrow(
      ConflictException,
    );
    await setFlag(true);
    const open = await athlete('FREE_LEVEL_ESTIMATED');
    expect(await service.view(open, areaIds)).toBeNull();
    await expect(service.select(open, 'PROGRAM_6M')).rejects.toThrow(
      ConflictException,
    );
  });

  it('computes P3/P6/P12 once per consolidated evaluation, with plateau and versioned engine', async () => {
    await setFlag(true);
    const userId = await athlete();
    const views = await Promise.all([
      service.view(userId, areaIds),
      service.view(userId, areaIds),
    ]);
    const view = views[0]!;
    expect(view.engine).toEqual({
      key: 'provisional-plateau',
      version: '1',
      provisional: true,
    });
    expect(view.horizons.map((h) => h.months)).toEqual([3, 6, 12]);
    const technique = view.horizons.map((h) => h.drivers[0].potential);
    expect(technique[0]).toBeGreaterThan(40);
    expect(technique[2]).toBeGreaterThan(technique[1]);
    // Il driver fisico è già oltre il tetto del livello: P resta R.
    expect(view.horizons.map((h) => h.drivers[1].potential)).toEqual([
      85, 85, 85,
    ]);
    expect(await prisma.potentialScenario.count({ where: { userId } })).toBe(6);
    await service.view(userId, areaIds);
    expect(await prisma.potentialScenario.count({ where: { userId } })).toBe(6);
  });

  it('saves the chosen horizon as PAYWALL_READY and keeps the program locked until a subscription', async () => {
    await setFlag(true);
    const userId = await athlete();
    await expect(service.select(userId, 'PROGRAM_9M')).rejects.toThrow();
    await service.select(userId, 'PROGRAM_6M');
    expect(
      await prisma.athleteCalibration.findUniqueOrThrow({ where: { userId } }),
    ).toMatchObject({ status: 'PAYWALL_READY' });
    expect(
      await prisma.athleteDiscovery.findUniqueOrThrow({ where: { userId } }),
    ).toMatchObject({ programHorizon: 'PROGRAM_6M', programDurationWeeks: 26 });
    // Si può cambiare idea prima di pagare.
    await service.select(userId, 'PROGRAM_12M');
    expect((await service.view(userId, areaIds))!.selectedHorizon).toBe(
      'PROGRAM_12M',
    );
    expect(
      await prisma.analyticsEvent.count({
        where: { userId, name: 'program_horizon_selected' },
      }),
    ).toBe(2);

    // Altri test possono aver riaperto il programma dal back office.
    const settings = await loadCalibrationSettings(prisma);
    await prisma.calibrationConfig.update({
      where: { id: 'default' },
      data: { programBeforePaywall: false },
    });
    await expect(assertProgramAllowed(prisma, userId)).rejects.toMatchObject({
      response: { code: 'PROGRAM_LOCKED_BEFORE_PAYWALL' },
    });
    await prisma.subscription.create({
      data: {
        userId,
        horizon: 'PROGRAM_12M',
        billingCycle: 'MONTHLY',
        status: 'ACTIVE',
        provider: 'STRIPE',
        amountCents: 1000,
        currency: 'EUR',
        entitlementEndAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    await expect(assertProgramAllowed(prisma, userId)).resolves.toBeUndefined();
    await prisma.calibrationConfig.update({
      where: { id: 'default' },
      data: { programBeforePaywall: settings.programBeforePaywall },
    });
  });
});
