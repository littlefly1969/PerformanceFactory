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
import { OrchestratorService } from '../src/ai-orchestrator/orchestrator.service';
import { AuthenticatedGuard } from '../src/common/guards/authenticated.guard';
import { PrismaService } from '../src/prisma/prisma.service';

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
    const userId = request.headers?.['x-test-user-id'];
    const role = request.headers?.['x-test-role'] as UserRole | undefined;

    if (!userId || !role) {
      return false;
    }

    const user = {
      id: userId,
      email: `${userId}@example.com`,
      role,
      createdAt: new Date(),
    };

    request.user = user;
    if (request.raw) {
      request.raw.user = user;
    }

    return true;
  }
}

describe('Admin cycle endpoints (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;

  const orchestratorMock = {
    runProposalBatch: () =>
      Promise.resolve([
        { userId: 'user-1', planReleaseId: 'plan-1', questionSetId: 'set-1' },
      ]),
    publishCycle: () =>
      Promise.resolve({ planReleaseId: 'plan-1', questionSetId: 'set-1' }),
  } as unknown as OrchestratorService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({} as PrismaService)
      .overrideProvider(OrchestratorService)
      .useValue(orchestratorMock)
      .overrideGuard(AuthenticatedGuard)
      .useClass(TestAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();

    const fastify = app.getHttpAdapter().getInstance() as unknown as {
      inject: InjectFn;
    };
    inject = fastify.inject.bind(fastify);
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin can run proposal cycle', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/admin/orchestrator/run',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'admin-1',
        'x-test-role': UserRole.ADMIN,
      },
      payload: JSON.stringify({ userIds: ['user-1'] }),
    });

    expect(response.statusCode).toBe(201);
  });

  it('professional cannot run proposal cycle', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/admin/orchestrator/run',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
      payload: JSON.stringify({ userIds: ['user-1'] }),
    });

    expect(response.statusCode).toBe(403);
  });

  it('user cannot publish cycle', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/admin/cycles/plan-1/publish',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('admin can publish cycle', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/admin/cycles/plan-1/publish',
      headers: {
        'x-test-user-id': 'admin-1',
        'x-test-role': UserRole.ADMIN,
      },
    });

    expect(response.statusCode).toBe(201);
  });
});
