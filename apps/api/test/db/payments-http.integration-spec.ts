import { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { AuthenticatedGuard } from '../../src/common/guards/authenticated.guard';
import { PaymentsModule } from '../../src/payments/payments.module';
import {
  signStubPayload,
  STUB_SIGNATURE_HEADER,
} from '../../src/payments/providers/stub-payment.provider';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { applyValidationPipe } from '../utils/apply-validation-pipe';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

const SECRET = 'http-integration-stub-secret';

/** L'utente arriva da un header di test: sessione e passport non sono oggetto del test. */
class HeaderUserGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
      raw?: { user?: unknown };
    }>();
    const id = request.headers['x-test-user'];
    if (!id) {
      return false;
    }
    const user = { id, email: `${id}@example.test`, role: UserRole.USER };
    request.user = user;
    if (request.raw) {
      request.raw.user = user;
    }
    return true;
  }
}

describe('Payments HTTP flow on PostgreSQL', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const env = { ...process.env };

  beforeAll(async () => {
    process.env.DATABASE_URL = getRequiredTestDatabaseUrl();
    process.env.PAYMENTS_PROVIDER = 'stub';
    process.env.PAYMENTS_STUB_WEBHOOK_SECRET = SECRET;
    await ensureTestDatabaseExists(process.env.DATABASE_URL);
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: process.env,
      stdio: 'pipe',
    });
    const module = await Test.createTestingModule({
      imports: [PrismaModule, PaymentsModule],
    })
      .overrideGuard(AuthenticatedGuard)
      .useClass(HeaderUserGuard)
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { rawBody: true },
    );
    app.setGlobalPrefix('api');
    applyValidationPipe(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    process.env = env;
  });

  function webhook(type: string, data: Record<string, unknown>) {
    const payload = JSON.stringify({ id: randomUUID(), type, data });
    return app.inject({
      method: 'POST',
      url: '/api/payments/webhooks/stub',
      headers: {
        'content-type': 'application/json',
        [STUB_SIGNATURE_HEADER]: signStubPayload(payload, SECRET),
      },
      payload,
    });
  }

  it('serves one checkout to concurrent clicks and unlocks access from a signed webhook', async () => {
    const user = await prisma.user.create({
      data: {
        email: `payments-http-${randomUUID()}@example.test`,
        password: 'unused-test-hash',
        role: 'USER',
      },
    });
    const headers = {
      'content-type': 'application/json',
      'x-test-user': user.id,
    };
    const clicks = await Promise.all(
      Array.from({ length: 4 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/payments/checkout',
          headers,
          payload: JSON.stringify({
            horizon: 'PROGRAM_3M',
            billingCycle: 'QUARTERLY',
          }),
        }),
      ),
    );
    expect(clicks.map((r) => r.statusCode)).toEqual([201, 201, 201, 201]);
    const bodies = clicks.map((r) =>
      r.json<{ subscriptionId: string; checkoutUrl: string }>(),
    );
    expect(new Set(bodies.map((b) => b.checkoutUrl)).size).toBe(1);

    const checkoutId = new URL(bodies[0].checkoutUrl).searchParams.get(
      'stub_checkout',
    );
    const completed = await webhook('CHECKOUT_COMPLETED', {
      checkoutId,
      subscriptionRef: `stub_sub_${user.id}`,
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ outcome: 'ACTIVATED' });

    const status = await app.inject({
      method: 'GET',
      url: '/api/payments/subscription',
      headers,
    });
    expect(status.json()).toMatchObject({
      entitled: true,
      subscription: {
        id: bodies[0].subscriptionId,
        horizon: 'PROGRAM_3M',
        billingCycle: 'QUARTERLY',
        status: 'ACTIVE',
      },
    });

    const again = await app.inject({
      method: 'POST',
      url: '/api/payments/checkout',
      headers,
      payload: JSON.stringify({
        horizon: 'PROGRAM_12M',
        billingCycle: 'ANNUAL',
      }),
    });
    expect(again.statusCode).toBe(409);
  });

  it('rejects a webhook whose body was altered after signing', async () => {
    const payload = JSON.stringify({
      id: randomUUID(),
      type: 'PAYMENT_FAILED',
      data: { subscriptionRef: 'stub_sub_x' },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/webhooks/stub',
      headers: {
        'content-type': 'application/json',
        [STUB_SIGNATURE_HEADER]: signStubPayload(payload, SECRET),
      },
      payload: payload.replace('stub_sub_x', 'stub_sub_y'),
    });
    expect(response.statusCode).toBe(400);
  });
});
