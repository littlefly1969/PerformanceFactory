import { validateDiscovery } from '../../src/discovery/discovery-validation';
import { deleteOnboardingTemplate } from '../../src/admin/admin-onboarding';
import {
  loadActiveAssessmentPrompt,
  upsertAssessmentPromptConfig,
} from '../../src/ai-orchestrator/assessment-prompts';
import { AiProposalProviderService } from '../../src/ai-orchestrator/proposal-provider.service';
import { runAssessmentEvaluation } from '../../src/discovery/assessment-evaluation';
import { loadSpecialistQuestionRecords } from '../../src/onboarding/onboarding-questions';
import { testAssessmentPrompt } from '../../src/ai-tuning/assessment-prompt-test';
import { SYNTHETIC_ASSESSMENT_CASE } from '../../src/ai-tuning/assessment-synthetic-case';
type JourneyResponse = {
  phase: string;
  count: number;
  fixedQuestionCount: number;
  areaQuestionCount: number;
  estimatedMinutes: number;
  assessmentComplete: boolean;
  firstName: string;
  trial: { days: number; daysLeft: number };
  currentQuestion: number;
  programDurationWeeks: number;
  evaluation: {
    id: string;
    status: string;
    drivers: Array<{
      id: string;
      score: number;
      confidence: number;
      rationale: string;
    }>;
  } | null;
  questions: Array<{
    id: string;
    kind: string;
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
import { CalibrationService } from '../../src/discovery/calibration/calibration.service';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import session from 'express-session';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  assertProgramAllowed,
  loadCalibrationSettings,
  updateCalibrationSettings,
} from '../../src/discovery/calibration/calibration-config';
import {
  loadActivePolicy,
  publishPolicy,
} from '../../src/discovery/calibration/confidence-policy';
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
      // Il flusso precedente riaperto dai test non resta acceso per i run successivi.
      await prisma.calibrationConfig.updateMany({
        data: { programBeforePaywall: false },
      });
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
        adultConfirmed: true,
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
      'Impossibile eliminare',
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

  it('does not start an invalid configuration and never falls back to AI questions', async () => {
    // Una delle due domande del driver Nutrizione dello sport di test.
    const nutrition = await prisma.onboardingQuestionTemplate.findFirstOrThrow({
      where: { id: { in: templateIds }, area: { name: 'Nutrizione' } },
    });
    await prisma.onboardingQuestionTemplate.update({
      where: { id: nutrition.id },
      data: { isActive: false },
    });
    try {
      expect((await state()).phase).toBe('ASSESSMENT_UNAVAILABLE');
      const start = await post('start');
      expect(start.statusCode).toBe(409);
      expect(start.json<{ code: string }>().code).toBe(
        'ASSESSMENT_CONFIGURATION_INVALID',
      );
      expect(
        await prisma.userOnboardingQuestion.count({ where: { userId } }),
      ).toBe(0);
    } finally {
      await prisma.onboardingQuestionTemplate.update({
        where: { id: nutrition.id },
        data: { isActive: true },
      });
    }
  });

  it('starts two operational questions and twelve configured driver questions', async () => {
    expect((await post('duration', { weeks: 12 })).statusCode).toBe(409);
    const intro = await state();
    expect(intro).toMatchObject({
      phase: 'ASSESSMENT_INTRO',
      fixedQuestionCount: 2,
      areaQuestionCount: 12,
      count: 14,
      estimatedMinutes: 5,
      trial: { days: 7, daysLeft: 7 },
    });
    // Giorni e durata non sono piu domande della discovery.
    expect(
      config.questions.some((q) =>
        ['training_days_available', 'training_session_duration'].includes(
          q.contextKey ?? '',
        ),
      ),
    ).toBe(false);
    const start = await post('start');
    expect(start.statusCode).toBe(201);
    const started = start.json<JourneyResponse>();
    expect(started.count).toBe(14);
    expect(started.questions.slice(0, 2).map((q) => q.kind)).toEqual([
      'OPERATIONAL',
      'OPERATIONAL',
    ]);
    expect(started.questions.slice(2).every((q) => q.kind === 'AREA')).toBe(
      true,
    );
    expect(new Set(started.questions.slice(2).map((q) => q.areaId)).size).toBe(
      6,
    );
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
    // La risposta operativa entra subito nel profilo letto dal training.
    expect(
      (
        await prisma.userOnboardingAssessment.findUniqueOrThrow({
          where: { userId },
        })
      ).profileJson,
    ).toHaveProperty('training_days_available.value', 1);
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
    const complete = await state();
    expect(complete.currentQuestion).toBe(14);
    expect(complete).toMatchObject({
      phase: 'ASSESSMENT',
      assessmentComplete: true,
    });
    expect(
      (
        await prisma.userOnboardingAssessment.findUniqueOrThrow({
          where: { userId },
        })
      ).profileJson,
    ).toMatchObject({
      training_days_available: { value: 2 },
      training_session_duration: { value: 45 },
    });
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

  it('evaluates the answers once with the AI and shows a provisional R per driver', async () => {
    const before = await state();
    expect(before).toMatchObject({
      phase: 'ASSESSMENT',
      assessmentComplete: true,
      evaluation: null,
    });
    // Doppio click: una richiesta valuta, l'altra trova il lease o la valutazione.
    const responses = await Promise.all([post('evaluate'), post('evaluate')]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual(
      expect.arrayContaining([201]),
    );
    expect(responses.every((r) => [201, 409].includes(r.statusCode))).toBe(
      true,
    );
    const response = responses.find((r) => r.statusCode === 201)!;
    const evaluated = response.json<JourneyResponse>();
    expect(evaluated.phase).toBe('EVALUATION');
    expect(evaluated.evaluation).toMatchObject({
      status: 'PROVISIONAL',
      source: 'SELF_ASSESSMENT',
      scale: { min: 0, max: 100 },
    });
    // Un asse per driver dell'assessment, nello stesso ordine, con score e confidence separati.
    const drivers = evaluated.evaluation!.drivers;
    expect(drivers.map((d) => d.id)).toEqual([
      ...new Set(before.questions.filter((q) => q.areaId).map((q) => q.areaId)),
    ]);
    for (const d of drivers) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
      expect(d.confidence).toBeLessThanOrEqual(40);
      expect(d.rationale).toBeTruthy();
      expect(d).not.toHaveProperty('potential');
    }
    const saved = await prisma.assessmentEvaluation.findFirstOrThrow({
      where: { userId },
      include: { areas: true, promptVersion: true },
    });
    expect(saved).toMatchObject({
      provider: 'stub',
      model: 'deterministic-stub',
    });
    expect(saved.areas).toHaveLength(6);
    expect(saved.promptVersion?.promptType).toBe('ASSESSMENT_EVALUATION');
    const active = await prisma.aiAssessmentPromptConfig.findFirstOrThrow({
      where: { isActive: true, kind: 'EVALUATION' },
    });
    expect(saved.promptVersionId).toBe(active.activePromptVersionId);
    expect(JSON.stringify(saved.inputJson)).not.toContain(email);
    expect(
      (saved.inputJson as { prompt: { system: string } }).prompt.system,
    ).toContain(active.basePrompt);

    // Una sola valutazione: le risposte sono bloccate.
    expect(
      (await post('evaluate')).json<JourneyResponse>().evaluation!.id,
    ).toBe(saved.id);
    expect(await prisma.assessmentEvaluation.count({ where: { userId } })).toBe(
      1,
    );
    // Anche scavalcando lease e controlli, il database tiene una sola prima valutazione.
    const replay = await runAssessmentEvaluation(
      prisma,
      app.get(AiProposalProviderService),
      userId,
      await loadSpecialistQuestionRecords(prisma, userId),
      {},
    ).catch((error: Error) => error);
    expect(replay).toEqual({ id: saved.id });
    expect(await prisma.assessmentEvaluation.count({ where: { userId } })).toBe(
      1,
    );
    expect((await post('back')).statusCode).toBe(409);
    const q = before.questions[0];
    expect(
      (await post('answer', { questionId: q.id, value: q.options[0].value }))
        .statusCode,
    ).toBe(409);
    expect((await state()).phase).toBe('EVALUATION');
  });

  it('calibrates with AI rounds on the least reliable drivers, with no wait and no closing by time', async () => {
    type Calibration = {
      status: string;
      day: number;
      nextRoundKind: string | null;
      completionReason: string | null;
      round: {
        id: string;
        kind: string;
        questions: Array<{
          id: string;
          areaId: string;
          options: Array<Record<string, unknown>>;
        }>;
      } | null;
    };
    const calibration = async () =>
      (await state()) as unknown as { calibration: Calibration };
    const initial = (await calibration()).calibration;
    expect(initial).toMatchObject({
      status: 'FREE_CALIBRATING',
      day: 1,
      nextRoundKind: 'ADAPTIVE',
      round: null,
    });

    // Doppio click: un solo round, con domande sui due driver meno affidabili.
    const opened = await Promise.all([
      post('calibration/round'),
      post('calibration/round'),
    ]);
    expect(opened.every((r) => [201, 409].includes(r.statusCode))).toBe(true);
    expect(await prisma.calibrationRound.count({ where: { userId } })).toBe(1);
    const round = (await calibration()).calibration.round!;
    expect(round.kind).toBe('ADAPTIVE');
    expect(round.questions).toHaveLength(4);
    expect(new Set(round.questions.map((q) => q.areaId)).size).toBe(2);
    // Lo score delle opzioni non arriva all'atleta.
    for (const q of round.questions)
      for (const o of q.options) expect(o).not.toHaveProperty('score');
    expect((await post('calibration/round')).statusCode).toBe(201);
    expect(await prisma.calibrationRound.count({ where: { userId } })).toBe(1);

    const answerAll = (r: NonNullable<Calibration['round']>) =>
      post('calibration/answers', {
        roundId: r.id,
        answers: Object.fromEntries(
          r.questions.map((q) => [q.id, q.options.at(-1)!.value]),
        ),
      });
    expect(
      (
        await post('calibration/answers', {
          roundId: round.id,
          answers: { [round.questions[0].id]: '0' },
        })
      ).statusCode,
    ).toBe(400);
    // Lease scaduto durante una chiamata AI lenta: B riprende il round mentre A
    // aspetta l'AI. B non riscrive le risposte e valuta quelle fissate da A; A
    // finisce dopo e non collega più la sua valutazione.
    const service = app.get(CalibrationService);
    const ai = app.get(AiProposalProviderService);
    const original = ai.evaluateAssessment.bind(ai);
    const pick = (r: NonNullable<Calibration['round']>, at: 0 | -1) =>
      Object.fromEntries(
        r.questions.map((q) => [q.id, String(q.options.at(at)!.value)]),
      );
    const expireLease = () =>
      prisma.athleteCalibration.update({
        where: { userId },
        data: { operationAt: new Date(Date.now() - 11 * 60 * 1000) },
      });
    const slow = jest
      .spyOn(ai, 'evaluateAssessment')
      .mockImplementationOnce(async (input) => {
        await expireLease();
        await service.answerRound(userId, round.id, pick(round, 0));
        return original(input);
      });
    try {
      await expect(
        service.answerRound(userId, round.id, pick(round, -1)),
      ).resolves.toBeUndefined();
    } finally {
      slow.mockRestore();
    }
    const fixedRound = await prisma.calibrationRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(fixedRound).toMatchObject({
      status: 'EVALUATED',
      answersJson: pick(round, -1),
      evaluationToken: null,
    });
    expect(fixedRound.evaluatedAt).toBeTruthy();
    // Replay della stessa risposta: nessuna nuova valutazione.
    expect((await answerAll(round)).statusCode).toBe(201);
    const second = await prisma.assessmentEvaluation.findFirstOrThrow({
      where: { userId, sequence: 2 },
      include: { areas: true, round: true },
    });
    expect(second).toMatchObject({
      source: 'CALIBRATION_ROUND',
      status: 'PROVISIONAL',
      round: { id: round.id, status: 'EVALUATED' },
    });
    expect(second.level).toBeTruthy();
    const targeted = new Set(round.questions.map((q) => q.areaId));
    for (const area of second.areas)
      expect(area.confidence).toBe(targeted.has(area.areaId) ? 60 : 30);
    expect(await prisma.assessmentEvaluation.count({ where: { userId } })).toBe(
      2,
    );
    const input = JSON.stringify(second.inputJson);
    expect(input).toContain('CALIBRATION');
    expect(input).toContain('previous');
    // La valutazione usa le risposte fissate per prime (A), non quelle di B.
    const evaluated = (
      second.inputJson as {
        prompt: {
          user: {
            drivers: Array<{
              answers: Array<{ answer: string; source: string }>;
            }>;
          };
        };
      }
    ).prompt.user.drivers.flatMap((d) =>
      d.answers.filter((x) => x.source === 'CALIBRATION').map((x) => x.answer),
    );
    expect(evaluated).toHaveLength(4);
    expect(new Set(evaluated)).toEqual(new Set(['Sempre']));

    // Nessun programma durante la calibrazione, salvo il parametro di back office.
    await updateCalibrationSettings(
      prisma,
      { programBeforePaywall: false },
      userId,
    );
    const blocked = await post('submit');
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      code: 'PROGRAM_LOCKED_BEFORE_PAYWALL',
    });
    await updateCalibrationSettings(
      prisma,
      { programBeforePaywall: true },
      userId,
    );
    await expect(assertProgramAllowed(prisma, userId)).resolves.toBeUndefined();
    await updateCalibrationSettings(
      prisma,
      { programBeforePaywall: false },
      userId,
    );
    await expect(assertProgramAllowed(prisma, userId)).rejects.toThrow(
      'abbonamento',
    );

    // AT-10: nessuna attesa fra i round, il prossimo si apre subito.
    expect((await calibration()).calibration).not.toHaveProperty('nextRoundAt');
    expect((await post('calibration/round')).statusCode).toBe(201);
    const next = (await calibration()).calibration.round!;
    expect(next.kind).toBe('ADAPTIVE');
    // Il round va sui driver ancora sotto la soglia per area della regola.
    expect(next.questions.every((q) => !targeted.has(q.areaId))).toBe(true);

    // AT-19/AT-27: il tempo trascorso non cambia il tipo di round né chiude R.
    const past = (days: number) => new Date(Date.now() - days * 86400000);
    await prisma.athleteCalibration.update({
      where: { userId },
      data: { startedAt: past(40), deadlineAt: past(10) },
    });
    // Variante AT-25: A fallisce mentre B, che ha ripreso il round, lo sta
    // valutando. Il catch di A non riapre un round che non è più suo.
    const failing = jest
      .spyOn(ai, 'evaluateAssessment')
      .mockImplementationOnce(async () => {
        await expireLease();
        await service.answerRound(userId, next.id, pick(next, 0));
        throw new Error('provider non raggiungibile');
      });
    try {
      await expect(
        service.answerRound(userId, next.id, pick(next, -1)),
      ).rejects.toThrow('provider non raggiungibile');
    } finally {
      failing.mockRestore();
    }
    expect(
      await prisma.calibrationRound.findUniqueOrThrow({
        where: { id: next.id },
      }),
    ).toMatchObject({ status: 'EVALUATED', answersJson: pick(next, -1) });
    const stillOpen = (await calibration()).calibration;
    expect(stillOpen).toMatchObject({
      status: 'FREE_CALIBRATING',
      completionReason: null,
      nextRoundKind: 'ADAPTIVE',
    });
    const third = await prisma.assessmentEvaluation.findFirstOrThrow({
      where: { userId, sequence: 3 },
    });
    const rule = await loadActivePolicy(prisma, 'R_CONSOLIDATION');
    expect(third).toMatchObject({
      source: 'CALIBRATION_ROUND',
      status: 'PROVISIONAL',
      consolidationPolicyId: rule.id,
    });
    // Anche dopo la durata indicativa la conoscenza dell'atleta prosegue.
    expect((await post('calibration/round')).statusCode).toBe(201);
    expect(
      await prisma.calibrationRound.count({
        where: { userId, status: 'OPEN' },
      }),
    ).toBe(1);
    expect((await post('submit')).json()).toMatchObject({
      code: 'PROGRAM_LOCKED_BEFORE_PAYWALL',
    });
  });

  it('consolidates only when the versioned rule is met and records the version used', async () => {
    const latest = () =>
      prisma.assessmentEvaluation.findFirstOrThrow({
        where: { userId },
        orderBy: { sequence: 'desc' },
      });
    const before = await loadActivePolicy(prisma, 'R_CONSOLIDATION');
    const calibration = () =>
      prisma.athleteCalibration.findUniqueOrThrow({ where: { userId } });
    expect((await calibration()).status).not.toBe('CALIBRATION_COMPLETED');
    expect((await latest()).status).toBe('PROVISIONAL');
    try {
      // Regola abbassata dal back office: al prossimo round richiesto la
      // valutazione corrente la soddisfa, si chiude e si consolida insieme.
      const lowered = await publishPolicy(
        prisma,
        'R_CONSOLIDATION',
        {
          minOverallConfidence: 1,
          minAreaConfidence: 1,
          minAreasAtConfidence: null,
        },
        'test',
        userId,
      );
      expect(lowered.version).toBe(before.version + 1);
      await prisma.calibrationRound.deleteMany({
        where: { userId, status: 'OPEN' },
      });
      expect((await post('calibration/round')).statusCode).toBe(201);
      expect(await calibration()).toMatchObject({
        status: 'CALIBRATION_COMPLETED',
        completionReason: 'CONFIDENCE_REACHED',
        consolidationPolicyId: lowered.id,
      });
      expect(await latest()).toMatchObject({
        status: 'CONSOLIDATED',
        consolidationPolicyId: lowered.id,
      });
      // La versione precedente resta nello storico.
      expect(
        await prisma.confidencePolicy.count({
          where: { kind: 'R_CONSOLIDATION' },
        }),
      ).toBe(before.version + 1);
      expect((await post('calibration/round')).statusCode).toBe(409);
    } finally {
      await publishPolicy(
        prisma,
        'R_CONSOLIDATION',
        {
          minOverallConfidence: before.minOverallConfidence,
          minAreaConfidence: before.minAreaConfidence,
          minAreasAtConfidence: before.minAreasAtConfidence,
        },
        'ripristino dopo il test',
        userId,
      );
    }
  });

  it('keeps calibration parameters and confidence rules consistent and reserved to admins', async () => {
    const settings = await loadCalibrationSettings(prisma);
    expect(settings).toMatchObject({
      levelConfidenceThreshold: 50,
      maxDays: 30,
    });
    for (const removed of [
      'confidenceThreshold',
      'closingDay',
      'minHoursBetweenRounds',
    ])
      expect(settings).not.toHaveProperty(removed);
    await expect(
      updateCalibrationSettings(
        prisma,
        { levelConfidenceThreshold: 0 },
        userId,
      ),
    ).rejects.toThrow('soglia del livello');
    const athlete = await app.inject({
      method: 'PUT',
      url: '/api/admin/calibration-config',
      headers: { cookie, authorization: `Bearer ${token}` },
      payload: { levelConfidenceThreshold: 10 },
    });
    expect(athlete.statusCode).toBe(403);
    expect(
      (await loadCalibrationSettings(prisma)).levelConfidenceThreshold,
    ).toBe(50);

    // Regole: solo admin, versioni consecutive anche in parallelo, mai vuote.
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/admin/confidence-policies/LESSON_ELIGIBILITY',
      headers: { cookie, authorization: `Bearer ${token}` },
      payload: { minOverallConfidence: 1 },
    });
    expect(forbidden.statusCode).toBe(403);
    const lesson = await loadActivePolicy(prisma, 'LESSON_ELIGIBILITY');
    const rule = {
      minOverallConfidence: lesson.minOverallConfidence,
      minAreaConfidence: lesson.minAreaConfidence,
      minAreasAtConfidence: lesson.minAreasAtConfidence,
    };
    const published = await Promise.all([
      publishPolicy(prisma, 'LESSON_ELIGIBILITY', rule, null, userId),
      publishPolicy(prisma, 'LESSON_ELIGIBILITY', rule, null, userId),
    ]);
    expect(published.map((p) => p.version).sort()).toEqual([
      lesson.version + 1,
      lesson.version + 2,
    ]);
    await expect(
      publishPolicy(
        prisma,
        'LESSON_ELIGIBILITY',
        {
          minOverallConfidence: null,
          minAreaConfidence: null,
          minAreasAtConfidence: null,
        },
        null,
        userId,
      ),
    ).rejects.toThrow('almeno una soglia');
  });

  it('versions an edited assessment prompt and makes it the only active one', async () => {
    const tuner = await prisma.user.create({
      data: {
        email: `tuner-${randomUUID()}@example.test`,
        password: 'x',
        role: 'AI_TUNER',
      },
    });
    const previous = await prisma.aiAssessmentPromptConfig.findFirstOrThrow({
      where: { isActive: true, kind: 'EVALUATION' },
    });
    try {
      const draft = await upsertAssessmentPromptConfig(
        prisma,
        { name: `bozza ${randomUUID()}`, basePrompt: 'Nuovo metodo.' },
        tuner.id,
      );
      expect(draft.isActive).toBe(false);
      expect((await loadActiveAssessmentPrompt(prisma)).basePrompt).toBe(
        previous.basePrompt,
      );
      const activated = await upsertAssessmentPromptConfig(
        prisma,
        { ...draft, basePrompt: 'Nuovo metodo, v2.', isActive: true },
        tuner.id,
      );
      expect(activated.version).toBe(2);
      expect(await loadActiveAssessmentPrompt(prisma)).toEqual({
        basePrompt: 'Nuovo metodo, v2.',
        promptVersionId: activated.activePromptVersionId,
      });
      expect(
        await prisma.aiAssessmentPromptConfig.count({
          where: { isActive: true, kind: 'EVALUATION' },
        }),
      ).toBe(1);
      expect(
        await prisma.aiPromptVersion.count({
          where: { assessmentPromptConfigId: draft.id },
        }),
      ).toBe(2);
    } finally {
      await upsertAssessmentPromptConfig(
        prisma,
        { ...previous, isActive: true },
        tuner.id,
      );
      await prisma.user.delete({ where: { id: tuner.id } });
    }
  });

  it('keeps exactly one active prompt when two drafts are activated at once', async () => {
    const tuner = await prisma.user.create({
      data: {
        email: `tuner-${randomUUID()}@example.test`,
        password: 'x',
        role: 'AI_TUNER',
      },
    });
    const previous = await prisma.aiAssessmentPromptConfig.findFirstOrThrow({
      where: { isActive: true, kind: 'EVALUATION' },
    });
    try {
      const drafts = await Promise.all(
        ['a', 'b'].map((key) =>
          upsertAssessmentPromptConfig(
            prisma,
            { name: `concorrente ${key} ${randomUUID()}`, basePrompt: key },
            tuner.id,
          ),
        ),
      );
      await Promise.all(
        drafts.map((draft) =>
          upsertAssessmentPromptConfig(
            prisma,
            { ...draft, isActive: true },
            tuner.id,
          ),
        ),
      );
      expect(
        await prisma.aiAssessmentPromptConfig.count({
          where: { isActive: true, kind: 'EVALUATION' },
        }),
      ).toBe(1);
    } finally {
      await upsertAssessmentPromptConfig(
        prisma,
        { ...previous, isActive: true },
        tuner.id,
      );
      await prisma.user.delete({ where: { id: tuner.id } });
    }
  });

  it('tests a tuner draft on the synthetic case and never sends a selected evaluation without consent', async () => {
    const ai = app.get(AiProposalProviderService);
    const synthetic = await testAssessmentPrompt(prisma, ai, 'Bozza di prova.');
    expect(synthetic.caseEvaluationId).toBeNull();
    expect(synthetic.output.drivers.map((d) => d.areaId)).toEqual(
      SYNTHETIC_ASSESSMENT_CASE.drivers.map((d) => d.areaId),
    );
    const real = await prisma.assessmentEvaluation.findFirstOrThrow({
      where: { userId },
    });
    const outsider = await prisma.user.create({
      data: {
        email: `no-consent-${randomUUID()}@example.test`,
        password: 'x',
        role: 'USER',
      },
    });
    const selected = await prisma.assessmentEvaluation.create({
      data: {
        userId: outsider.id,
        summary: real.summary,
        overallConfidence: real.overallConfidence,
        minScore: real.minScore,
        maxScore: real.maxScore,
        provider: real.provider,
        model: real.model,
        promptHash: real.promptHash,
        inputJson: real.inputJson as object,
        outputJson: real.outputJson as object,
      },
    });
    const evaluate = jest.spyOn(ai, 'evaluateAssessment');
    const provider = process.env.AI_PROVIDER;
    try {
      // Con lo stub nulla esce dal sistema: la valutazione scelta si può provare.
      expect(
        (await testAssessmentPrompt(prisma, ai, 'Bozza.', selected.id))
          .caseEvaluationId,
      ).toBe(selected.id);
      evaluate.mockClear();
      process.env.AI_PROVIDER = 'openai';
      await expect(
        testAssessmentPrompt(prisma, ai, 'Bozza.', selected.id),
      ).rejects.toThrow('consenso');
      expect(evaluate).not.toHaveBeenCalled();
    } finally {
      process.env.AI_PROVIDER = provider;
      evaluate.mockRestore();
      await prisma.user.delete({ where: { id: outsider.id } });
    }
  });

  it('submits a real baseline once and derives result exclusively from its persisted areas', async () => {
    // Flusso precedente (baseline e piano) riaperto dal back office per questi test.
    await updateCalibrationSettings(
      prisma,
      { programBeforePaywall: true },
      userId,
    );
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
    // La durata arriva dalla risposta operativa dell'assessment.
    expect(assessment.profileJson).toHaveProperty(
      'training_session_duration.value',
      45,
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
