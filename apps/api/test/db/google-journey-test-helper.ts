import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConsentsService } from '../../src/consents/consents.service';
import { DiscoveryDraft } from '../../src/discovery/discovery.types';

/** Only Google's external token/JWKS transport is replaced. State, nonce, RSA verification and DB are real. */
export async function testGoogleRegistration(
  app: NestFastifyApplication,
  prisma: PrismaService,
  draft: DiscoveryDraft,
  cleanup: string[],
) {
  const previous = {
    client: process.env.GOOGLE_OIDC_CLIENT_ID,
    secret: process.env.GOOGLE_OIDC_CLIENT_SECRET,
    redirect: process.env.GOOGLE_OIDC_REDIRECT_URI,
    domain: process.env.GOOGLE_OIDC_HOSTED_DOMAIN,
  };
  process.env.GOOGLE_OIDC_CLIENT_ID = 'pf4-test-client';
  process.env.GOOGLE_OIDC_CLIENT_SECRET = 'test-secret';
  process.env.GOOGLE_OIDC_REDIRECT_URI =
    'http://localhost/api/auth/google/callback';
  delete process.env.GOOGLE_OIDC_HOSTED_DOMAIN;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  let jwt = '';
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes('/token'))
        return new Response(JSON.stringify({ id_token: jwt }), { status: 200 });
      if (url.includes('/certs'))
        return new Response(
          JSON.stringify({
            keys: [
              {
                ...publicKey.export({ format: 'jwk' }),
                kid: 'test',
                alg: 'RS256',
              },
            ],
          }),
          { status: 200 },
        );
      throw new Error('Unexpected external request');
    });
  const email = `pf4-google-${randomUUID()}@example.test`;
  const subject = randomUUID();
  const begin = async (mode: 'login' | 'register') => {
    const r = await app.inject({
      method: 'GET',
      url: `/api/auth/google/${mode}?returnTo=/journey`,
    });
    expect(r.statusCode).toBe(302);
    const url = new URL(String(r.headers.location));
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', kid: 'test' }),
    ).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: 'pf4-test-client',
        sub: subject,
        email,
        email_verified: true,
        nonce: url.searchParams.get('nonce'),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        given_name: 'Google',
        family_name: 'Athlete',
      }),
    ).toString('base64url');
    jwt = `${header}.${body}.${sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url')}`;
    const cookie = String(r.headers['set-cookie']).split(';')[0];
    const callback = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=test&state=${url.searchParams.get('state')}`,
      headers: { cookie },
    });
    return { callback, cookie };
  };
  try {
    const { callback, cookie } = await begin('register');
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toContain('/journey?google=complete');
    const docs = (
      await app.inject({ method: 'GET', url: '/api/consents/documents' })
    ).json<Awaited<ReturnType<ConsentsService['requiredDocuments']>>>();
    const consents = {
      privacyAccepted: true,
      aiAssistantAccepted: true,
      acceptedDocuments: docs.map(
        (d: { type: string; version: string; documentHash: string }) => ({
          type: d.type,
          version: d.version,
          documentHash: d.documentHash,
        }),
      ),
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/google/register/complete',
          headers: { cookie },
          payload: consents,
        })
      ).statusCode,
    ).toBe(400);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/google/register/complete',
      headers: { cookie },
      payload: { ...consents, discovery: draft },
    });
    expect(response.statusCode).toBe(201);
    const result = response.json<{
      user: { id: string; role: string; isActive: boolean; password?: string };
      status: string;
    }>();
    const user = result.user;
    cleanup.push(user.id);
    expect(user.isActive).toBe(true);
    expect(user.role).toBe('USER');
    expect(user.password).toBeUndefined();
    expect(result.status).toBe('ACTIVE');
    const created = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        discovery: true,
        sportSelection: true,
        performanceGoal: true,
        onboardingAssessment: true,
        authIdentities: true,
      },
    });
    expect(created.discovery?.draft).toEqual(draft);
    expect(created.sportSelection?.sportId).toBe(draft.sportId);
    expect(created.performanceGoal).toBeTruthy();
    expect(created.onboardingAssessment?.status).toBe('PENDING');
    expect(created.authIdentities).toHaveLength(1);
    const sessionCookie = String(response.headers['set-cookie']);
    expect(sessionCookie).toContain('HttpOnly');
    const state = await app.inject({
      method: 'GET',
      url: '/api/auth/journey',
      headers: { cookie: sessionCookie.split(';')[0] },
    });
    expect(state.json<{ phase: string }>().phase).toBe('ASSESSMENT_INTRO');
    const login = await begin('login');
    expect(login.callback.headers.location).toContain('/journey');
    const loggedIn = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: String(
          login.callback.headers['set-cookie'] ?? login.cookie,
        ).split(';')[0],
      },
    });
    expect(loggedIn.json<{ id: string }>().id).toBe(user.id);
  } finally {
    fetchMock.mockRestore();
    for (const [key, value] of Object.entries({
      GOOGLE_OIDC_CLIENT_ID: previous.client,
      GOOGLE_OIDC_CLIENT_SECRET: previous.secret,
      GOOGLE_OIDC_REDIRECT_URI: previous.redirect,
      GOOGLE_OIDC_HOSTED_DOMAIN: previous.domain,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
