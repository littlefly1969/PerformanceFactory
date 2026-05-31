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
import { applyValidationPipe } from './utils/apply-validation-pipe';

type InjectResponse = {
  statusCode: number;
  json: () => unknown;
};

type InjectFn = (options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: string;
}) => Promise<InjectResponse>;

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string>;
      user?: unknown;
      raw?: { user?: unknown };
    }>();
    const user = {
      id: request.headers?.['x-test-user-id'] ?? 'user-1',
      email: 'user-1@example.com',
      role: UserRole.USER,
      createdAt: new Date(),
    };

    request.user = user;
    if (request.raw) {
      request.raw.user = user;
    }

    return true;
  }
}

describe('Onboarding DTO validation (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({} as PrismaService)
      .overrideGuard(AuthenticatedGuard)
      .useClass(TestAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
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
  });

  it('rejects malformed onboarding answer values before service validation', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/onboarding/submit',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'user-1',
      },
      payload: JSON.stringify({
        goalText: 'Migliorare la performance in gara',
        answers: [{ questionId: 'question-1', value: { nested: true } }],
      }),
    });

    expect(response.statusCode).toBe(400);
  });
});
