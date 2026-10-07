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
import { ConsentsService } from '../../src/consents/consents.service';
import { signAccessToken } from '../../src/common/auth-token';
import {
  DiscoveryConfiguration,
  DiscoveryDraft,
} from '../../src/discovery/discovery.types';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

/** Slice Ingresso: 18+, attribuzione, eventi, feature flag e marketing su PostgreSQL reale. */
describe('Entry slice with PostgreSQL', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let draft: DiscoveryDraft;
  let sportId: string;
  let adminToken: string;
  const users: string[] = [];
  const templateIds: string[] = [];
  const partnerIds: string[] = [];
  const anonymousIds: string[] = [];
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
        secret: 'entry-integration-test-secret',
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
        key: `entry-test-${randomUUID()}`,
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
    const config = (
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

    const admin = await prisma.user.create({
      data: {
        email: `entry-admin-${randomUUID()}@example.test`,
        password: 'not-used',
        role: 'ADMIN',
      },
    });
    users.push(admin.id);
    await app.get(ConsentsService).grantRequired(admin.id, {});
    adminToken = signAccessToken(admin).accessToken;
  }, 60000);

  afterAll(async () => {
    delete process.env.PF4_SPORT_KEY;
    delete process.env.PF4_SPECIALIZATION_KEY;
    if (prisma) {
      await prisma.featureFlag.deleteMany({ where: { key: 'referral_share' } });
      await prisma.featureFlagChange.deleteMany({
        where: { actorId: { in: users } },
      });
      await prisma.analyticsEvent.deleteMany({
        where: { anonymousId: { in: anonymousIds } },
      });
      for (const userId of users) {
        await prisma.consent.deleteMany({ where: { userId } });
        await prisma.userPerformanceGoal.deleteMany({ where: { userId } });
        await prisma.userOnboardingAssessment.deleteMany({ where: { userId } });
        await prisma.userSportSelection.deleteMany({ where: { userId } });
        await prisma.authIdentity.deleteMany({ where: { userId } });
      }
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
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

  const anonymousId = () => {
    const id = randomUUID();
    anonymousIds.push(id);
    return id;
  };

  const register = async (payload: Record<string, unknown>) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register-athlete',
      payload: {
        firstName: 'Giulia',
        lastName: 'Bianchi',
        email: `entry-${randomUUID()}@example.test`,
        password: 'test-password-123',
        discovery: draft,
        ...payload,
      },
    });
    if (response.statusCode === 201)
      users.push(response.json<{ user: { id: string } }>().user.id);
    return response;
  };

  const admin = (
    method: 'GET' | 'PATCH' | 'POST' | 'PUT',
    url: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${adminToken}` },
      ...(payload && { payload }),
    });

  it('blocks registration without the 18+ declaration and creates nothing', async () => {
    const before = await prisma.user.count();
    const missing = await register({});
    expect(missing.statusCode).toBe(400);
    const refused = await register({ adultConfirmed: false });
    expect(refused.statusCode).toBe(400);
    expect(refused.json<{ message: string }>().message).toContain(
      'maggiorenni',
    );
    expect(await prisma.user.count()).toBe(before);
  });

  it('attributes club and referrer, links the anonymous id and logs the server event', async () => {
    const club = (
      await admin('POST', '/api/admin/partners', {
        code: `club-${randomUUID().slice(0, 8)}`,
        name: 'Padel Club Test',
        city: 'Roma',
      })
    ).json<{ id: string; code: string }>();
    partnerIds.push(club.id);
    expect(
      (
        await admin('POST', '/api/admin/partners', {
          code: club.code,
          name: 'Duplicato',
        })
      ).statusCode,
    ).toBe(409);

    const referrer = await prisma.user.create({
      data: {
        email: `entry-referrer-${randomUUID()}@example.test`,
        password: 'not-used',
        role: 'USER',
        referralCode: `ref${randomUUID().slice(0, 6)}`,
      },
    });
    users.push(referrer.id);

    const visitor = anonymousId();
    const response = await register({
      adultConfirmed: true,
      attribution: {
        anonymousId: visitor,
        firstTouch: {
          source: 'instagram',
          campaign: 'autunno',
          club: club.code.toUpperCase(),
          at: new Date(Date.now() - 60_000).toISOString(),
        },
        lastTouch: { source: 'google', ref: referrer.referralCode },
      },
    });
    expect(response.statusCode).toBe(201);
    const userId = response.json<{ user: { id: string } }>().user.id;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { attribution: true },
    });
    expect(user.adultConfirmedAt).toBeInstanceOf(Date);
    expect(user.attribution).toMatchObject({
      anonymousId: visitor,
      partnerId: club.id,
      referrerId: referrer.id,
      firstTouch: { source: 'instagram', campaign: 'autunno', club: club.code },
      lastTouch: { source: 'google', ref: referrer.referralCode },
    });
    const event = await prisma.analyticsEvent.findFirstOrThrow({
      where: { userId, name: 'registration_completed' },
    });
    expect(event).toMatchObject({
      origin: 'SERVER',
      anonymousId: visitor,
      properties: {
        method: 'email',
        source: 'instagram',
        campaign: 'autunno',
        club: club.code,
        referred: true,
      },
    });

    const partners = (await admin('GET', '/api/admin/partners')).json<
      Array<{ id: string; attributedUsers: number }>
    >();
    expect(partners.find((p) => p.id === club.id)?.attributedUsers).toBe(1);
  });

  it('keeps an inactive or unknown club in the touches without attributing it', async () => {
    const club = (
      await admin('POST', '/api/admin/partners', {
        code: `closed-${randomUUID().slice(0, 8)}`,
        name: 'Circolo chiuso',
      })
    ).json<{ id: string; code: string }>();
    partnerIds.push(club.id);
    expect(
      (
        await admin('PATCH', `/api/admin/partners/${club.id}`, {
          isActive: false,
        })
      ).statusCode,
    ).toBe(200);
    const response = await register({
      adultConfirmed: true,
      attribution: { firstTouch: { club: club.code } },
    });
    const userId = response.json<{ user: { id: string } }>().user.id;
    const attribution = await prisma.userAttribution.findUniqueOrThrow({
      where: { userId },
    });
    expect(attribution.partnerId).toBeNull();
    expect(attribution.firstTouch).toEqual({ club: club.code });

    const direct = await register({ adultConfirmed: true });
    const directId = direct.json<{ user: { id: string } }>().user.id;
    expect(
      (
        await prisma.userAttribution.findUniqueOrThrow({
          where: { userId: directId },
        })
      ).firstTouch,
    ).toEqual({ source: 'direct' });
  });

  it('accepts only allowlisted anonymous browser events', async () => {
    const visitor = anonymousId();
    const events = [
      {
        name: 'landing_viewed',
        eventId: anonymousId(),
        properties: { path: '/start', email: 'mario@example.com' },
      },
      { name: 'discovery_started', eventId: anonymousId() },
    ];
    const send = (payload: object) =>
      app.inject({ method: 'POST', url: '/api/public/events', payload });
    const accepted = await send({ anonymousId: visitor, events });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toEqual({ accepted: 2 });
    // Lo stesso invio ripetuto non crea nuovi eventi.
    expect((await send({ anonymousId: visitor, events })).json()).toEqual({
      accepted: 0,
    });
    const saved = await prisma.analyticsEvent.findMany({
      where: { anonymousId: visitor, origin: 'CLIENT', userId: null },
      orderBy: { name: 'desc' },
    });
    expect(saved).toHaveLength(2);
    // Le proprietà non previste per l'evento non vengono salvate.
    expect(saved[0].properties).toEqual({ path: '/start' });
    const tooMany = Array.from({ length: 6 }, () => ({
      name: 'landing_viewed',
      eventId: anonymousId(),
    }));
    for (const events of [
      [{ name: 'registration_completed', eventId: anonymousId() }],
      [
        {
          name: 'landing_viewed',
          eventId: anonymousId(),
          properties: { nested: { a: 1 } },
        },
      ],
      [{ name: 'landing_viewed' }],
      tooMany,
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/public/events',
            payload: { anonymousId: visitor, events },
          })
        ).statusCode,
      ).toBe(400);
    const funnel = (
      await admin('GET', '/api/admin/analytics/funnel?days=1')
    ).json<{
      events: Record<string, number>;
    }>();
    expect(funnel.events.landing_viewed).toBeGreaterThanOrEqual(1);
  });

  it('releases a flag to beta testers first, then to everyone, with audit', async () => {
    const athlete = (await register({ adultConfirmed: true })).json<{
      user: { id: string; email: string };
    }>().user;
    await app.get(ConsentsService).grantRequired(athlete.id, {});
    const athleteToken = signAccessToken({
      id: athlete.id,
      email: athlete.email,
      role: 'USER',
    }).accessToken;
    const asAthlete = (url: string) =>
      app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${athleteToken}` },
      });

    expect((await asAthlete('/api/admin/feature-flags')).statusCode).toBe(403);
    expect((await asAthlete('/api/features/me')).json()).toEqual({
      referral_share: false,
    });
    expect((await asAthlete('/api/athlete/referral')).statusCode).toBe(404);

    expect(
      (
        await admin('PATCH', '/api/admin/feature-flags/referral_share', {
          enabled: true,
          betaTesters: true,
          rolloutPercent: 0,
        })
      ).statusCode,
    ).toBe(200);
    expect((await asAthlete('/api/features/me')).json()).toEqual({
      referral_share: false,
    });
    expect(
      (
        await admin('PUT', '/api/admin/beta-testers', {
          email: athlete.email,
          isBetaTester: true,
        })
      ).statusCode,
    ).toBe(200);
    expect((await asAthlete('/api/features/me')).json()).toEqual({
      referral_share: true,
    });
    // Ripetere la stessa scelta non aggiunge righe al registro.
    await admin('PUT', '/api/admin/beta-testers', {
      email: athlete.email,
      isBetaTester: true,
    });
    const betaChanges = await prisma.betaTesterChange.findMany({
      where: { userId: athlete.id },
      include: { actor: { select: { role: true } } },
    });
    expect(betaChanges).toMatchObject([
      { before: false, after: true, actor: { role: 'ADMIN' } },
    ]);
    const first = (await asAthlete('/api/athlete/referral')).json<{
      code: string;
      link: string;
      invited: number;
    }>();
    expect(first.code).toMatch(/^[a-z2-9]{8}$/);
    expect(first.link).toContain(`/start?ref=${first.code}`);
    expect((await asAthlete('/api/athlete/referral')).json()).toEqual(first);

    expect(
      (await app.inject({ method: 'GET', url: '/api/public/features' })).json(),
    ).toEqual({
      referral_share: false,
    });
    await admin('PATCH', '/api/admin/feature-flags/referral_share', {
      rolloutPercent: 100,
    });
    expect(
      (await app.inject({ method: 'GET', url: '/api/public/features' })).json(),
    ).toEqual({
      referral_share: true,
    });
    expect(
      (
        await admin('PATCH', '/api/admin/feature-flags/unknown', {
          enabled: true,
        })
      ).statusCode,
    ).toBe(404);
    const flagChanges = await prisma.featureFlagChange.findMany({
      where: { flagKey: 'referral_share' },
      include: { actor: { select: { role: true } } },
    });
    expect(flagChanges.length).toBeGreaterThanOrEqual(2);
    expect(flagChanges.every((c) => c.actor?.role === 'ADMIN')).toBe(true);
  });

  it('grants and withdraws the optional marketing consent without touching required ones', async () => {
    const athlete = (await register({ adultConfirmed: true })).json<{
      user: { id: string; email: string };
    }>().user;
    const token = signAccessToken({
      id: athlete.id,
      email: athlete.email,
      role: 'USER',
    }).accessToken;
    const docs = (
      await app.inject({ method: 'GET', url: '/api/consents/documents' })
    ).json<Array<{ type: string; version: string; documentHash: string }>>();
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/consents/required',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        privacyAccepted: true,
        aiAssistantAccepted: true,
        marketingAccepted: true,
        acceptedDocuments: docs.map(({ type, version, documentHash }) => ({
          type,
          version,
          documentHash,
        })),
      },
    });
    expect(accepted.statusCode).toBe(201);
    const marketing = () =>
      app.inject({
        method: 'GET',
        url: '/api/consents/marketing',
        headers: { authorization: `Bearer ${token}` },
      });
    expect((await marketing()).json()).toMatchObject({ granted: true });
    const withdrawn = await app.inject({
      method: 'PUT',
      url: '/api/consents/marketing',
      headers: { authorization: `Bearer ${token}` },
      payload: { granted: false },
    });
    expect(withdrawn.json()).toMatchObject({ granted: false });
    expect(
      await prisma.consent.count({
        where: { userId: athlete.id, withdrawnAt: null },
      }),
    ).toBe(2);
    await app.inject({
      method: 'PUT',
      url: '/api/consents/marketing',
      headers: { authorization: `Bearer ${token}` },
      payload: { granted: true },
    });
    expect((await marketing()).json()).toMatchObject({ granted: true });
  });
});
