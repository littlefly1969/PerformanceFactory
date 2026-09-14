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
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthenticatedGuard } from '../src/common/guards/authenticated.guard';

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

type FastifyTestInstance = {
  ready: () => Promise<void>;
  inject: InjectFn;
};

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

const makePrismaMock = () => {
  const planItems = [
    {
      id: 'pi-active',
      status: 'ACTIVE',
      title: 'Active item',
      body: 'Do the work',
      type: 'TASK',
      metadata: null,
      areaId: 'area-1',
      completedAt: null,
      completionNotes: null,
      completionRating: null,
      area: { id: 'area-1', name: 'Nutrition' },
      planRelease: { userId: 'user-1', status: 'ACTIVE' },
    },
    {
      id: 'pi-completed',
      status: 'COMPLETED',
      title: 'Completed item',
      body: 'Already done',
      type: 'TASK',
      metadata: null,
      areaId: 'area-1',
      completedAt: new Date('2026-02-01T10:00:00.000Z'),
      completionNotes: 'Done',
      completionRating: 4,
      area: { id: 'area-1', name: 'Nutrition' },
      planRelease: { userId: 'user-1', status: 'ACTIVE' },
    },
    {
      id: 'pi-proposed',
      status: 'PROPOSED',
      title: 'Proposed item',
      body: 'Not active',
      type: 'TASK',
      metadata: null,
      areaId: 'area-2',
      completedAt: null,
      completionNotes: null,
      completionRating: null,
      area: { id: 'area-2', name: 'Equipment' },
      planRelease: { userId: 'user-1', status: 'ACTIVE' },
    },
    {
      id: 'pi-foreign',
      status: 'ACTIVE',
      title: 'Other user item',
      body: 'Not yours',
      type: 'TASK',
      metadata: null,
      areaId: 'area-3',
      completedAt: null,
      completionNotes: null,
      completionRating: null,
      area: { id: 'area-3', name: 'Mental Training' },
      planRelease: { userId: 'user-2', status: 'ACTIVE' },
    },
  ];

  const planRelease = {
    id: 'plan-1',
    userId: 'user-1',
    areaId: 'area-1',
    version: 1,
    status: 'ACTIVE',
    generatedBy: 'AI',
    createdAt: new Date('2026-02-01T09:00:00.000Z'),
    sourceSnapshotId: 'snap-1',
    items: planItems.filter(
      (item) =>
        item.planRelease.userId === 'user-1' && item.status !== 'PROPOSED',
    ),
  };

  const prismaMock = {
    improvementPlanRelease: {
      findFirst: ({
        where,
      }: {
        where: { userId: string; areaId?: string; status: string };
      }) => {
        if (
          where.userId === 'user-1' &&
          where.status === 'ACTIVE' &&
          where.areaId === 'area-1'
        ) {
          return planRelease;
        }
        return null;
      },
    },
    planItem: {
      findUnique: ({ where }: { where: { id: string } }) =>
        planItems.find((item) => item.id === where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          status: string;
          completedAt: Date;
          completionNotes?: string;
          completionRating?: number;
        };
      }) => {
        const item = planItems.find((entry) => entry.id === where.id);
        if (!item) {
          return null;
        }
        item.status = data.status;
        item.completedAt = data.completedAt;
        if (data.completionNotes !== undefined) {
          item.completionNotes = data.completionNotes;
        }
        if (data.completionRating !== undefined) {
          item.completionRating = data.completionRating;
        }
        return {
          id: item.id,
          status: item.status,
          completedAt: item.completedAt,
          completionNotes: item.completionNotes,
          completionRating: item.completionRating,
        };
      },
    },
  } as unknown as PrismaService;

  return { prismaMock, planItems };
};

describe('User plan (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;
  let planItems: Array<{
    id: string;
    status: string;
    completedAt: Date | null;
    completionNotes: string | null;
    completionRating: number | null;
    planRelease: { userId: string; status: string };
  }>;

  beforeAll(async () => {
    const { prismaMock, planItems: items } = makePrismaMock();
    planItems = items;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideGuard(AuthenticatedGuard)
      .useClass(TestAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();
    const fastify = app.getHttpAdapter().getInstance() as FastifyTestInstance;
    await fastify.ready();
    inject = (options) => fastify.inject(options);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns current active plan for the user', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/user/plan/current?areaId=area-1',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      id: string;
      userId: string;
      items: Array<{ id: string; status: string }>;
    };
    expect(payload.userId).toBe('user-1');
    expect(payload.items.every((item) => item.status !== 'PROPOSED')).toBe(
      true,
    );
  });

  it('does not expose other user plans', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/user/plan/current?areaId=area-1',
      headers: {
        'x-test-user-id': 'user-2',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('completes an active plan item', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/user/plan-items/pi-active/complete',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ completionNotes: 'Done', completionRating: 5 }),
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { id: string; status: string };
    expect(payload.status).toBe('COMPLETED');
    const updated = planItems.find((item) => item.id === 'pi-active');
    expect(updated?.status).toBe('COMPLETED');
    const untouched = planItems.find((item) => item.id === 'pi-proposed');
    expect(untouched?.status).toBe('PROPOSED');
  });

  it('rejects completion for non-active items', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/user/plan-items/pi-proposed/complete',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(400);
  });

  it('is idempotent for completed items', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/user/plan-items/pi-completed/complete',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(409);
  });

  it('rejects completion for other users', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/user/plan-items/pi-foreign/complete',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(403);
  });

  it('requires json content type for completion payloads', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/user/plan-items/pi-active/complete',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
      payload: JSON.stringify({ completionNotes: 'Done' }),
    });

    expect(response.statusCode).toBe(415);
  });
});
