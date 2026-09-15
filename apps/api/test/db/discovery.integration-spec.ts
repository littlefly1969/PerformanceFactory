import { ConsentsService } from '../../src/consents/consents.service';
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
import {
  DiscoveryConfiguration,
  DiscoveryDraft,
} from '../../src/discovery/discovery.types';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

/** Real Fastify + HTTP-only sessions + migrated PostgreSQL, with no auth/database mocks. */
describe('PF4 discovery to authenticated journey', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let config: DiscoveryConfiguration;
  let draft: DiscoveryDraft;
  let sportId: string;
  let cookie: string;
  let userId: string;
  const email = `pf4-${randomUUID()}@example.test`;
  const originalUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
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
        ThrottlerModule.forRoot([
          { name: 'register-athlete', limit: 100, ttl: 60000 },
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
        secret: 'pf4-integration-test-secret',
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
        key: `pf4-test-${randomUUID()}`,
        label: 'Test sport',
        specializations: { create: { key: 'single', label: 'Singolo' } },
      },
      include: { specializations: true },
    });
    sportId = sport.id;
    const response = await app.inject({
      method: 'GET',
      url: '/api/public/athlete-discovery',
    });
    expect(response.statusCode).toBe(200);
    config = response.json();
    draft = {
      version: config.version,
      currentStep: 'registration',
      sportId,
      specializationId: sport.specializations[0].id,
      goalId: config.questions.find((q) => q.target === 'goalId')!.options[0]
        .id,
      answers: {},
    };
    for (const q of config.questions.filter((q) => !q.target))
      draft.answers[q.id] = q.options[0].id;
  }, 60000);

  afterAll(async () => {
    if (prisma) {
      if (userId) {
        await prisma.consent.deleteMany({ where: { userId } });
        await prisma.userPerformanceGoal.deleteMany({ where: { userId } });
        await prisma.userOnboardingAssessment.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
      }
      if (sportId) await prisma.sport.delete({ where: { id: sportId } });
    }
    await app?.close();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  const register = (discovery: unknown = draft) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/register-athlete',
      payload: {
        firstName: 'Mario',
        lastName: 'Rossi',
        email,
        password: 'test-password-123',
        discovery,
      },
    });

  it('publishes read-only ordered configuration without private prompt data', async () => {
    const before = await prisma.onboardingQuestionTemplate.count();
    const response = await app.inject({
      method: 'GET',
      url: '/api/public/athlete-discovery',
    });
    expect(response.json<DiscoveryConfiguration>().version).toBe(
      config.version,
    );
    expect(response.body).not.toContain('trainingPrompt');
    expect(await prisma.onboardingQuestionTemplate.count()).toBe(before);
    expect(config.questions.map((q) => q.order)).toEqual(
      config.questions.map((q) => q.order).sort((a, b) => a - b),
    );
  });

  it('reflects added, edited and disabled backend questions with a new version', async () => {
    const template = await prisma.onboardingQuestionTemplate.create({
      data: {
        key: `pf4-extra-${randomUUID()}`,
        scope: 'DISCOVERY',
        label: 'Domanda aggiuntiva',
        inputType: 'SELECT',
        orderIndex: 100,
        optionsJson: {
          type: 'boolean',
          options: [
            { id: 'yes', label: 'Sì', value: true },
            { id: 'no', label: 'No', value: false },
          ],
        },
      },
    });
    try {
      const added = (
        await app.inject({
          method: 'GET',
          url: '/api/public/athlete-discovery',
        })
      ).json<DiscoveryConfiguration>();
      expect(added.version).not.toBe(config.version);
      expect(added.questions).toHaveLength(config.questions.length + 1);
      expect(added.questions.at(-1)?.type).toBe('boolean');
      await prisma.onboardingQuestionTemplate.update({
        where: { id: template.id },
        data: { label: 'Testo aggiornato', orderIndex: 25 },
      });
      const edited = (
        await app.inject({
          method: 'GET',
          url: '/api/public/athlete-discovery',
        })
      ).json<DiscoveryConfiguration>();
      expect(edited.version).not.toBe(added.version);
      expect(edited.questions[2].title).toBe('Testo aggiornato');
      await prisma.onboardingQuestionTemplate.update({
        where: { id: template.id },
        data: { isActive: false },
      });
      const disabled = (
        await app.inject({
          method: 'GET',
          url: '/api/public/athlete-discovery',
        })
      ).json<DiscoveryConfiguration>();
      expect(disabled.questions).toEqual(config.questions);
    } finally {
      await prisma.onboardingQuestionTemplate.delete({
        where: { id: template.id },
      });
    }
  });

  it('rejects stale config and arbitrary options without creating any athlete', async () => {
    expect((await register({ ...draft, version: 0 })).statusCode).toBe(400);
    expect((await register({ ...draft, goalId: 'invalid' })).statusCode).toBe(
      400,
    );
    expect(
      (
        await register({
          ...draft,
          answers: { ...draft.answers, forged: true },
        })
      ).statusCode,
    ).toBe(400);
    expect((await register(null)).statusCode).toBe(400);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('registers an active athlete atomically and sets an HTTP-only cookie', async () => {
    const response = await register();
    expect(response.statusCode).toBe(201);
    const result = response.json<{
      user: { id: string; isActive: boolean; password?: string };
      journey: { phase: string; nextStep: string };
    }>();
    expect(result.journey).toEqual({ phase: 'CONSENTS', nextStep: 'CONSENTS' });
    expect(result.user.isActive).toBe(true);
    expect(result.user.password).toBeUndefined();
    userId = result.user.id;
    const header = String(response.headers['set-cookie']);
    expect(header).toContain('HttpOnly');
    cookie = header.split(';')[0];
    const persisted = await prisma.athleteDiscovery.findUniqueOrThrow({
      where: { userId },
    });
    expect(persisted.draft).toEqual(draft);
    expect(persisted.configuration).toHaveProperty('version', config.version);
    expect(
      await prisma.userSportSelection.findUnique({ where: { userId } }),
    ).toMatchObject({ sportId });
  });

  it('continues using only the cookie, with no second login or consent bypass', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/journey',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ nextStep: string }>().nextStep).toBe('CONSENTS');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { cookie },
        })
      ).json<{ id: string }>().id,
    ).toBe(userId);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/journey' }))
        .statusCode,
    ).toBe(403);
  });

  it('keeps consent checks enforced and changes nextStep from backend consent state', async () => {
    const tokenResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/token',
      headers: { cookie },
    });
    const token = tokenResponse.json<{ accessToken: string }>().accessToken;
    const protectedResponse = await app.inject({
      method: 'POST',
      url: '/api/consents/ai',
      headers: { cookie, authorization: `Bearer ${token}` },
    });
    expect(protectedResponse.statusCode).toBe(403);
    expect(protectedResponse.json<{ code: string }>().code).toBe(
      'REQUIRED_CONSENTS_MISSING',
    );
    await app
      .get(ConsentsService)
      .grantRequired(userId, { source: 'integration-test' });
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/journey',
      headers: { cookie },
    });
    expect(response.json<{ nextStep: string }>().nextStep).toBe('ASSESSMENT');
  });

  it('rejects duplicate registration while keeping the persisted journey', async () => {
    expect((await register()).statusCode).toBe(400);
    expect(await prisma.athleteDiscovery.count({ where: { userId } })).toBe(1);
  });
});
