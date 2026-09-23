import { validateDiscovery } from '../../src/discovery/discovery-validation';
import { deleteOnboardingTemplate } from '../../src/admin/admin-onboarding';
type JourneyResponse = {
  phase: string;
  count: number;
  currentQuestion: number;
  programDurationWeeks: number;
  questions: Array<{
    id: string;
    areaId: string;
    options: Array<{ value: string }>;
  }>;
  result: {
    snapshotId: string;
    current: number;
    drivers: Array<{ current: number }>;
  };
};
import { ConsentsService } from '../../src/consents/consents.service';
import { Test } from '@nestjs/testing';
import { ConflictException, ValidationPipe } from '@nestjs/common';
import { AthleteJourneyService } from '../../src/discovery/athlete-journey.service';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import session from 'express-session';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { testGoogleRegistration } from './google-journey-test-helper';
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
  let testSportKey: string;
  let token: string;
  const googleUsers: string[] = [];
  const templateIds: string[] = [];
  let cookie: string;
  let userId: string;
  const email = `pf4-${randomUUID()}@example.test`;
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
    testSportKey = sport.key;
    process.env.PF4_SPORT_KEY = sport.key;
    process.env.PF4_SPECIALIZATION_KEY = 'single';
    const demo = await prisma.onboardingQuestionTemplate.findMany({
      where: { key: { startsWith: 'pf4_padel_assessment_' } },
    });
    expect(demo).toHaveLength(12);
    for (const q of demo) {
      const created = await prisma.onboardingQuestionTemplate.create({
        data: {
          key: `test-${randomUUID()}`,
          scope: 'AREA',
          areaId: q.areaId,
          label: q.label,
          inputType: q.inputType,
          orderIndex: q.orderIndex,
          optionsJson: { ...(q.optionsJson as object), sportKey: testSportKey },
        },
      });
      templateIds.push(created.id);
    }
    const response = await app.inject({
      method: 'GET',
      url: '/api/public/athlete-discovery',
    });
    expect(response.statusCode).toBe(200);
    config = response.json();
    expect(config.sportContext).toMatchObject({
      mode: 'fixed',
      sport: { id: sportId },
    });
    expect(
      config.questions.some(
        (q) => q.target === 'sportId' || q.target === 'specializationId',
      ),
    ).toBe(false);
    draft = {
      version: config.version,
      currentStep: 'registration',
      // Neither sport nor specialization is supplied by the client.
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
      const cleanupIds = [userId, ...googleUsers].filter(Boolean);
      for (const userId of cleanupIds) {
        await prisma.performanceProfileSnapshotArea.deleteMany({
          where: { snapshot: { userId } },
        });
        await prisma.performanceProfileSnapshot.deleteMany({
          where: { userId },
        });
        await prisma.currentState.deleteMany({ where: { userId } });
        await prisma.userAreaPromptInstruction.deleteMany({
          where: { userId },
        });
        await prisma.consent.deleteMany({ where: { userId } });
        await prisma.userPerformanceGoal.deleteMany({ where: { userId } });
        await prisma.userOnboardingAssessment.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
      }
      await prisma.onboardingQuestionTemplate.deleteMany({
        where: { id: { in: templateIds } },
      });
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

  it('migrates the event branch and rejects breaking its parent configuration', async () => {
    const event = config.questions.find((q) => q.code === 'pf4_event')!;
    const date = config.questions.find((q) => q.code === 'pf4_event_date')!;
    expect(date.visibleWhen).toEqual({
      match: 'all',
      rules: [
        { question: event.code, operator: 'in', values: ['0', '1', '2'] },
      ],
    });
    const withoutEvent = validateDiscovery(config, {
      ...draft,
      answers: {
        ...draft.answers,
        [event.id]: '3',
        [date.id]: 'forged-hidden-date',
      },
    });
    expect(withoutEvent.answers).not.toHaveProperty(date.id);
    await expect(deleteOnboardingTemplate(prisma, event.id)).rejects.toThrow(
      'deve dipendere',
    );
    expect(
      await prisma.onboardingQuestionTemplate.findUnique({
        where: { id: event.id },
      }),
    ).not.toBeNull();
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
        data: { label: 'Testo aggiornato', orderIndex: 24 },
      });
      const edited = (
        await app.inject({
          method: 'GET',
          url: '/api/public/athlete-discovery',
        })
      ).json<DiscoveryConfiguration>();
      expect(edited.version).not.toBe(added.version);
      expect(edited.questions.find((q) => q.id === template.id)?.title).toBe(
        'Testo aggiornato',
      );
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
    expect(persisted.draft).toEqual({
      ...draft,
      sportId,
      specializationId:
        config.sportContext?.mode === 'fixed'
          ? config.sportContext.specialization.id
          : undefined,
    });
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
    token = tokenResponse.json<{ accessToken: string }>().accessToken;
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
    expect(response.json<{ nextStep: string }>().nextStep).toBe(
      'ASSESSMENT_INTRO',
    );
  });

  it('rejects duplicate registration while keeping the persisted journey', async () => {
    expect((await register()).statusCode).toBe(400);
    expect(await prisma.athleteDiscovery.count({ where: { userId } })).toBe(1);
  });
  const post = (path: string, payload: object = {}) =>
    app.inject({
      method: 'POST',
      url: `/api/athlete-journey/${path}`,
      headers: { cookie, authorization: `Bearer ${token}` },
      payload,
    });
  const state = async () =>
    (
      await app.inject({
        method: 'GET',
        url: '/api/auth/journey',
        headers: { cookie },
      })
    ).json<JourneyResponse>();

  it('starts twelve configured specialist questions without repeating discovery', async () => {
    expect((await post('duration', { weeks: 12 })).statusCode).toBe(409);
    const start = await post('start');
    expect(start.statusCode).toBe(201);
    expect(start.json<JourneyResponse>().count).toBe(12);
    expect(
      new Set(
        start
          .json<JourneyResponse>()
          .questions.map((q: { areaId: string }) => q.areaId),
      ).size,
    ).toBe(6);
    expect(
      start
        .json<JourneyResponse>()
        .questions.every(
          (q: { id: string }) => !config.questions.some((d) => d.id === q.id),
        ),
    ).toBe(true);
    expect((await post('start')).json<JourneyResponse>().questions).toEqual(
      start.json<JourneyResponse>().questions,
    );
    expect((await post('submit')).statusCode).toBe(400);
    expect(
      (await post('answer', { questionId: 'foreign', value: 1 })).statusCode,
    ).toBe(400);
  });

  it('persists each answer and cursor, rejects invalid answers, and resumes after refresh', async () => {
    const before = await state();
    const q = before.questions[0];
    expect(
      (await post('answer', { questionId: q.id, value: 'forged' })).statusCode,
    ).toBe(400);
    expect(
      (await post('answer', { questionId: q.id, value: q.options[0].value }))
        .statusCode,
    ).toBe(201);
    expect((await state()).currentQuestion).toBe(1);
    expect(
      (await post('answer', { questionId: q.id, value: q.options[0].value }))
        .statusCode,
    ).toBe(409);
    await post('back');
    expect((await state()).currentQuestion).toBe(0);
    for (const question of before.questions) {
      const response = await post('answer', {
        questionId: question.id,
        value: question.options[1].value,
      });
      expect(response.statusCode).toBe(201);
    }
    expect((await state()).currentQuestion).toBe(12);
  });

  it('preserves questions and progress when a competing start finishes before claiming', async () => {
    const before = await state();
    const count = jest
      .spyOn(prisma.userOnboardingQuestion, 'count')
      .mockResolvedValueOnce(0);
    try {
      const resumed = await app.get(AthleteJourneyService).start(userId);
      expect(resumed).toMatchObject({
        phase: 'ASSESSMENT',
        currentQuestion: before.currentQuestion,
        questions: before.questions,
      });
    } finally {
      count.mockRestore();
    }
  });

  it('submits the answers read under the lease and releases it after goal rejection', async () => {
    const before = await prisma.athleteDiscovery.findUniqueOrThrow({
      where: { userId },
    });
    const question = (await state()).questions[0];
    const value = question.options[0].value;
    await prisma.athleteDiscovery.update({
      where: { userId },
      data: {
        assessmentAnswers: {
          ...(before.assessmentAnswers as Record<string, string>),
          [question.id]: value,
        },
      },
    });
    // Model a submit request whose preliminary read predates the last answer write.
    const read = jest
      .spyOn(prisma.athleteDiscovery, 'findUnique')
      .mockResolvedValueOnce(before);
    const validate = jest
      .spyOn(app.get(OnboardingService), 'validateFinalGoal')
      .mockRejectedValueOnce(new ConflictException('Rivedi il tuo obiettivo'));
    try {
      await expect(
        app.get(AthleteJourneyService).submit(userId),
      ).rejects.toThrow('Rivedi il tuo obiettivo');
      expect(validate).toHaveBeenCalledWith(
        { id: userId, role: 'USER' },
        expect.any(String),
        expect.arrayContaining([{ questionId: question.id, value }]),
      );
      expect(
        await prisma.athleteDiscovery.findUniqueOrThrow({ where: { userId } }),
      ).toMatchObject({ operationAt: null, baselineId: null });
      expect((await state()).phase).toBe('ASSESSMENT');
    } finally {
      read.mockRestore();
      validate.mockRestore();
    }
  });

  it('recovers an expired processing lease and allows editing again', async () => {
    await prisma.athleteDiscovery.update({
      where: { userId },
      data: { operationAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    expect((await post('back')).statusCode).toBe(201);
    const resumed = await state();
    const q = resumed.questions[resumed.currentQuestion];
    expect(
      (await post('answer', { questionId: q.id, value: q.options[1].value }))
        .statusCode,
    ).toBe(201);
  });

  it('submits a real baseline once and derives result exclusively from its persisted areas', async () => {
    const response = await post('submit');
    expect(response.statusCode).toBe(201);
    const result = response.json<JourneyResponse>().result;
    expect(response.json<JourneyResponse>().phase).toBe('RESULT');
    expect(result.drivers).toHaveLength(6);
    const snapshot = await prisma.performanceProfileSnapshot.findUniqueOrThrow({
      where: { id: result.snapshotId },
      include: { areas: true },
    });
    expect(result.current).toBe(snapshot.rankingGlobal);
    expect(result.drivers.map((d: { current: number }) => d.current)).toEqual(
      expect.arrayContaining(snapshot.areas.map((a) => a.realR)),
    );
    const assessment = await prisma.userOnboardingAssessment.findUniqueOrThrow({
      where: { userId },
    });
    expect(assessment.status).toBe('COMPLETED');
    expect(assessment.profileJson).toHaveProperty(
      'training_days_available.value',
      1,
    );
    expect(assessment.profileJson).toHaveProperty(
      'training_session_duration.value',
      30,
    );
    expect(assessment.profileJson).toHaveProperty(
      'general_training_frequency.value',
    );
    expect(assessment.profileJson).toHaveProperty(
      'general_height_cm.value',
      130,
    );
    expect(assessment.profileJson).toHaveProperty(
      'general_health_status.value',
      'Nessuna',
    );
    expect(
      (await post('submit')).json<JourneyResponse>().result.snapshotId,
    ).toBe(result.snapshotId);
    expect(
      await prisma.performanceProfileSnapshot.count({ where: { userId } }),
    ).toBe(1);
    expect((await post('back')).statusCode).toBe(409);
  });

  it('persists program duration and feeds the existing program generation context', async () => {
    expect((await post('duration', { weeks: 7 })).statusCode).toBe(400);
    expect((await post('duration')).json<JourneyResponse>().phase).toBe(
      'DURATION',
    );
    expect((await state()).phase).toBe('DURATION');
    expect(
      (await post('duration', { weeks: 12 })).json<JourneyResponse>().phase,
    ).toBe('COMPLETE');
    expect((await state()).programDurationWeeks).toBe(12);
    expect(
      (
        await prisma.userOnboardingAssessment.findUniqueOrThrow({
          where: { userId },
        })
      ).profileJson,
    ).toHaveProperty('program_duration_weeks.value', 12);
  });

  it('preserves discovery through verified Google OIDC and creates the same active domain state', async () => {
    await testGoogleRegistration(app, prisma, draft, googleUsers);
  });
});
