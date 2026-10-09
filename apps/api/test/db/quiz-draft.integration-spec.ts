import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import session from 'express-session';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../../src/auth/auth.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FeaturesModule } from '../../src/features/features.module';
import { AnalyticsModule } from '../../src/analytics/analytics.module';
import { PartnersModule } from '../../src/partners/partners.module';
import { ConsentsModule } from '../../src/consents/consents.module';
import {
  DiscoveryConfiguration,
  DiscoveryDraft,
} from '../../src/discovery/discovery.types';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

/**
 * Bozza server del Quiz Funnel (PF-FS-PREPAYWALL F1, F3): ripresa entro 7
 * giorni con la stessa versione, scadenza, validazione e collegamento atomico
 * alla registrazione. AT-04, AT-06.
 */
describe('Quiz draft on PostgreSQL', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let draft: DiscoveryDraft;
  let config: DiscoveryConfiguration;
  let sportId: string;
  const users: string[] = [];
  const templateIds: string[] = [];
  const originalUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.AI_PROVIDER = 'stub';
    process.env.DATABASE_URL = getRequiredTestDatabaseUrl();
    await ensureTestDatabaseExists(process.env.DATABASE_URL);
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: process.env,
      stdio: 'pipe',
    });
    const module = await Test.createTestingModule({
      imports: [
        PrismaModule,
        AuthModule,
        ConsentsModule,
        FeaturesModule,
        AnalyticsModule,
        PartnersModule,
        ThrottlerModule.forRoot([
          { name: 'register-athlete', limit: 100, ttl: 60000 },
          { name: 'public-events', limit: 100, ttl: 60000 },
        ]),
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.getHttpAdapter().init?.();
    app.use(
      session({
        name: 'pf.sid',
        secret: 'quiz-draft-integration-test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: 'lax' },
      }),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);

    const sport = await prisma.sport.create({
      data: {
        key: `quiz-test-${randomUUID()}`,
        label: 'Entry sport',
        specializations: { create: { key: 'single', label: 'Singolo' } },
      },
    });
    sportId = sport.id;
    process.env.PF4_SPORT_KEY = sport.key;
    process.env.PF4_SPECIALIZATION_KEY = 'single';
    const demo = await prisma.onboardingQuestionTemplate.findMany({
      where: { key: { startsWith: 'pf4_padel_assessment_' } },
    });
    for (const q of demo)
      templateIds.push(
        (
          await prisma.onboardingQuestionTemplate.create({
            data: {
              key: `test-${randomUUID()}`,
              scope: 'AREA',
              areaId: q.areaId,
              label: q.label,
              inputType: q.inputType,
              orderIndex: q.orderIndex,
              optionsJson: {
                ...(q.optionsJson as object),
                sportKey: sport.key,
              },
            },
          })
        ).id,
      );
    config = (
      await app.inject({ method: 'GET', url: '/api/public/athlete-discovery' })
    ).json<DiscoveryConfiguration>();
    draft = {
      version: config.version,
      currentStep: 'registration',
      goalId: config.questions.find((q) => q.target === 'goalId')!.options[0]
        .id,
      answers: {},
    };
    for (const q of config.questions.filter((q) => !q.target))
      draft.answers[q.id] =
        q.type === 'number'
          ? q.min
          : q.type === 'date'
            ? '2027-01-01'
            : q.options[0].id;
  }, 60000);

  afterAll(async () => {
    delete process.env.PF4_SPORT_KEY;
    delete process.env.PF4_SPECIALIZATION_KEY;
    if (prisma) {
      for (const userId of users) {
        await prisma.consent.deleteMany({ where: { userId } });
        await prisma.userPerformanceGoal.deleteMany({ where: { userId } });
        await prisma.userOnboardingAssessment.deleteMany({ where: { userId } });
        await prisma.userSportSelection.deleteMany({ where: { userId } });
        await prisma.authIdentity.deleteMany({ where: { userId } });
      }
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.onboardingQuestionTemplate.deleteMany({
        where: { id: { in: templateIds } },
      });
      await prisma.sportSpecialization.deleteMany({ where: { sportId } });
      if (sportId) await prisma.sport.delete({ where: { id: sportId } });
    }
    await app?.close();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  type Created = { token: string; draft: DiscoveryDraft; expiresAt: string };
  const start = async () =>
    (await app.inject({ method: 'POST', url: '/api/public/quiz-drafts' })).json<
      Created & { configuration: DiscoveryConfiguration }
    >();
  const read = (token: string) =>
    app.inject({
      method: 'GET',
      url: '/api/public/quiz-draft',
      headers: { 'x-quiz-token': token },
    });
  const save = (token: string, progress: unknown) =>
    app.inject({
      method: 'PUT',
      url: '/api/public/quiz-draft',
      headers: { 'x-quiz-token': token },
      payload: { draft: progress },
    });
  const register = async (payload: Record<string, unknown>) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register-athlete',
      payload: {
        firstName: 'Giulia',
        lastName: 'Bianchi',
        email: `quiz-${randomUUID()}@example.test`,
        password: 'test-password-123',
        adultConfirmed: true,
        discovery: draft,
        ...payload,
      },
    });
    if (response.statusCode === 201)
      users.push(response.json<{ user: { id: string } }>().user.id);
    return response;
  };
  const firstQuestion = () => config.questions.find((q) => !q.target)!;

  it('AT-04: resumes the same answers and version, extending the 7 days from the last answer', async () => {
    const created = await start();
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.configuration.version).toBe(config.version);
    // Il token in chiaro non è mai salvato.
    expect(
      await prisma.quizDraft.count({ where: { tokenHash: created.token } }),
    ).toBe(0);
    const q = firstQuestion();
    const progress = {
      ...created.draft,
      currentStep: q.id,
      answers: { [q.id]: draft.answers[q.id] },
    };
    const saved = await save(created.token, progress);
    expect(saved.statusCode).toBe(200);
    expect(
      Date.parse(saved.json<{ expiresAt: string }>().expiresAt),
    ).toBeGreaterThanOrEqual(Date.parse(created.expiresAt));
    const resumed = (await read(created.token)).json<{
      configuration: DiscoveryConfiguration;
      draft: DiscoveryDraft;
    }>();
    expect(resumed.draft).toEqual(progress);
    expect(resumed.configuration.version).toBe(config.version);
  });

  it('rejects unknown questions, invalid values and another version', async () => {
    const { token, draft: empty } = await start();
    const q = firstQuestion();
    for (const progress of [
      { ...empty, answers: { unknown: 'x' } },
      { ...empty, answers: { [q.id]: 'not-an-option' } },
      { ...empty, version: config.version + 1 },
      { ...empty, extra: true },
    ])
      expect((await save(token, progress)).statusCode).toBe(400);
  });

  it('forgets an expired draft and lets the athlete start over', async () => {
    const expired = await start();
    const row = await prisma.quizDraft.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
    });
    await prisma.quizDraft.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await read(expired.token)).statusCode).toBe(404);
    expect(await prisma.quizDraft.count({ where: { id: row.id } })).toBe(0);
    expect((await read('not-a-token')).statusCode).toBe(404);

    const restarted = await start();
    const removed = await app.inject({
      method: 'DELETE',
      url: '/api/public/quiz-draft',
      headers: { 'x-quiz-token': restarted.token },
    });
    expect(removed.statusCode).toBe(204);
    expect((await read(restarted.token)).statusCode).toBe(404);
  });

  it('AT-06: links the draft to the account once, on the version the quiz started with', async () => {
    const { token } = await start();
    expect((await save(token, draft)).statusCode).toBe(200);
    // La configurazione cambia dopo l'avvio del quiz: la bozza resta valida.
    const added = await prisma.onboardingQuestionTemplate.create({
      data: {
        key: `quiz-extra-${randomUUID()}`,
        scope: 'DISCOVERY',
        label: 'Domanda aggiunta dopo',
        inputType: 'SELECT',
        required: false,
        orderIndex: 9999,
        optionsJson: {
          type: 'single_choice',
          options: [{ id: 'a', label: 'A', value: 'a' }],
        },
      },
    });
    templateIds.push(added.id);
    try {
      const current = (
        await app.inject({
          method: 'GET',
          url: '/api/public/athlete-discovery',
        })
      ).json<DiscoveryConfiguration>();
      expect(current.version).not.toBe(config.version);
      // Senza bozza server la versione vecchia viene rifiutata.
      expect((await register({})).statusCode).toBe(400);

      const linked = await register({ quizToken: token });
      expect(linked.statusCode).toBe(201);
      const userId = linked.json<{ user: { id: string } }>().user.id;
      const discovery = await prisma.athleteDiscovery.findUniqueOrThrow({
        where: { userId },
      });
      expect(Number(discovery.version)).toBe(config.version);
      expect(discovery.draft).toMatchObject({ answers: draft.answers });
      expect((await read(token)).statusCode).toBe(404);
      // Nessun doppio import: lo stesso token non crea un secondo account.
      const before = await prisma.user.count();
      expect((await register({ quizToken: token })).statusCode).toBe(404);
      expect(await prisma.user.count()).toBe(before);
    } finally {
      await prisma.onboardingQuestionTemplate.delete({
        where: { id: added.id },
      });
      templateIds.splice(templateIds.indexOf(added.id), 1);
    }
  });
});
