import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthenticatedGuard } from '../src/common/guards/authenticated.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  signStubPayload,
  STUB_SIGNATURE_HEADER,
} from '../src/payments/providers/stub-payment.provider';
import { applyValidationPipe } from './utils/apply-validation-pipe';

type InjectResponse = { statusCode: number; json: () => unknown };
type InjectFn = (options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: string;
}) => Promise<InjectResponse>;

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      user?: unknown;
      raw?: { user?: unknown };
    }>();
    const user = {
      id: 'user-1',
      email: 'user-1@example.com',
      role: UserRole.USER,
    };
    request.user = user;
    if (request.raw) {
      request.raw.user = user;
    }
    return true;
  }
}

const prismaFake = {
  billingCyclePrice: {
    findMany: jest.fn().mockResolvedValue([
      { billingCycle: 'MONTHLY', amountCents: 1990, currency: 'eur' },
      { billingCycle: 'ANNUAL', amountCents: 15000, currency: 'eur' },
    ]),
  },
  programBillingOption: {
    findMany: jest.fn().mockResolvedValue([
      { horizon: 'PROGRAM_3M', billingCycle: 'MONTHLY', isActive: true },
      { horizon: 'PROGRAM_12M', billingCycle: 'ANNUAL', isActive: true },
      { horizon: 'PROGRAM_12M', billingCycle: 'MONTHLY', isActive: false },
    ]),
  },
};

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;
  const previousSecret = process.env.PAYMENTS_STUB_WEBHOOK_SECRET;

  beforeAll(async () => {
    process.env.PAYMENTS_STUB_WEBHOOK_SECRET = 'e2e-secret';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaFake as unknown as PrismaService)
      .overrideGuard(AuthenticatedGuard)
      .useClass(TestAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { rawBody: true },
    );
    app.setGlobalPrefix('api');
    applyValidationPipe(app);
    await app.init();

    const fastify = app.getHttpAdapter().getInstance() as unknown as {
      inject: InjectFn;
    };
    inject = fastify.inject.bind(fastify);
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.PAYMENTS_STUB_WEBHOOK_SECRET;
    } else {
      process.env.PAYMENTS_STUB_WEBHOOK_SECRET = previousSecret;
    }
  });

  it('lists only active horizon and billing combinations', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/payments/offers',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        horizon: 'PROGRAM_3M',
        potential: 'P3',
        billingOptions: [
          expect.objectContaining({
            billingCycle: 'MONTHLY',
            amountCents: 1990,
          }),
        ],
      }),
      expect.objectContaining({
        horizon: 'PROGRAM_12M',
        billingOptions: [expect.objectContaining({ billingCycle: 'ANNUAL' })],
      }),
    ]);
  });

  it('rejects checkout payloads that are not a valid horizon and cycle', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/payments/checkout',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        horizon: 'PROGRAM_24M',
        billingCycle: 'WEEKLY',
      }),
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects webhooks for unknown providers and with an invalid signature', async () => {
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'PAYMENT_FAILED',
      data: {},
    });
    const unknown = await inject({
      method: 'POST',
      url: '/api/payments/webhooks/bitcoin',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(unknown.statusCode).toBe(400);

    const forged = await inject({
      method: 'POST',
      url: '/api/payments/webhooks/stub',
      headers: {
        'content-type': 'application/json',
        [STUB_SIGNATURE_HEADER]: signStubPayload(payload, 'wrong-secret'),
      },
      payload,
    });
    expect(forged.statusCode).toBe(400);
    expect(forged.json()).toMatchObject({
      message: 'Firma webhook stub non valida',
    });
  });
});
