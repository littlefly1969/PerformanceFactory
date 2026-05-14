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

const makePrismaMock = () => {
  const areas = [
    { id: 'area-1', name: 'Nutrition' },
    { id: 'area-2', name: 'Equipment' },
  ];

  const questionSets: Record<
    string,
    {
      id: string;
      userId: string;
      status: string;
      planReleaseId?: string;
      areaId?: string;
      questions: Array<{
        areaId: string;
        answers: Array<{ scoreAwarded: number }>;
      }>;
    }
  > = {
    complete: {
      id: 'set-complete',
      userId: 'user-1',
      status: 'PUBLISHED',
      planReleaseId: 'plan-1',
      areaId: 'area-1',
      questions: [
        {
          areaId: 'area-1',
          answers: [{ scoreAwarded: 80 }, { scoreAwarded: 100 }],
        },
      ],
    },
    incomplete: {
      id: 'set-incomplete',
      userId: 'user-1',
      status: 'PUBLISHED',
      planReleaseId: 'plan-1',
      areaId: 'area-1',
      questions: [
        { areaId: 'area-1', answers: [{ scoreAwarded: 70 }] },
        { areaId: 'area-1', answers: [] },
      ],
    },
    closed: {
      id: 'set-closed',
      userId: 'user-1',
      status: 'CLOSED',
      planReleaseId: 'plan-1',
      areaId: 'area-1',
      questions: [{ areaId: 'area-1', answers: [{ scoreAwarded: 70 }] }],
    },
  };

  const snapshots: Array<{
    id: string;
    userId: string;
    rankingGlobal: number;
    reason: string;
    createdAt: Date;
    areas: Array<{ areaId: string; realR: number; potentialP: number }>;
  }> = [];

  const prismaMock = {
    questionSet: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Object.values(questionSets).find((set) => set.id === where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string };
      }) => {
        const set = Object.values(questionSets).find(
          (entry) => entry.id === where.id,
        );
        if (!set) {
          return null;
        }
        set.status = data.status;
        return set;
      },
    },
    performanceScaleConfig: {
      findFirst: () => ({
        minScore: 0,
        maxScore: 100,
        potentialStep: 5,
        thresholdRatio: 0.85,
      }),
    },
    area: {
      findMany: () => areas,
    },
    performanceProfileSnapshot: {
      findMany: () => [
        {
          id: 'snapshot-prev',
          userId: 'user-1',
          rankingGlobal: 50,
          reason: 'prev',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          areas: [
            { areaId: 'area-1', realR: 40, potentialP: 80 },
            { areaId: 'area-2', realR: 60, potentialP: 90 },
          ],
        },
        {
          id: 'snapshot-older',
          userId: 'user-1',
          rankingGlobal: 35,
          reason: 'older',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          areas: [
            { areaId: 'area-1', realR: 20, potentialP: 70 },
            { areaId: 'area-2', realR: 50, potentialP: 90 },
          ],
        },
      ],
      findFirst: () => ({
        id: 'snapshot-prev',
        userId: 'user-1',
        rankingGlobal: 50,
        reason: 'prev',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        areas: [
          { areaId: 'area-1', realR: 40, potentialP: 80 },
          { areaId: 'area-2', realR: 60, potentialP: 90 },
        ],
      }),
      create: ({
        data,
      }: {
        data: {
          userId: string;
          rankingGlobal: number;
          reason: string;
          areas: {
            create: Array<{
              areaId: string;
              realR: number;
              potentialP: number;
            }>;
          };
        };
      }) => {
        const entry = {
          id: `snapshot-${snapshots.length + 1}`,
          userId: data.userId,
          rankingGlobal: data.rankingGlobal,
          reason: data.reason,
          createdAt: new Date(),
          areas: data.areas.create,
        };
        snapshots.push(entry);
        return { id: entry.id, createdAt: entry.createdAt };
      },
    },
    improvementPlanRelease: {
      update: () => ({ id: 'plan-1' }),
    },
    aiContextSummary: {
      updateMany: () => ({ count: 1 }),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaMock as unknown as PrismaService),
  } as unknown as PrismaService;

  return { prismaMock, snapshots, questionSets };
};

describe('Close cycle (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;
  let snapshots: Array<{
    id: string;
    userId: string;
    rankingGlobal: number;
    areas: Array<{ areaId: string; realR: number; potentialP: number }>;
  }>;

  beforeAll(async () => {
    const mock = makePrismaMock();
    snapshots = mock.snapshots;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mock.prismaMock)
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

  it('rejects close if question set is incomplete', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/questions/set-incomplete/close',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('creates snapshot on close with expected values', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/questions/set-complete/close',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(snapshots).toHaveLength(1);
    const snapshot = snapshots[0];
    expect(snapshot.userId).toBe('user-1');
    const area1 = snapshot.areas.find((area) => area.areaId === 'area-1');
    const area2 = snapshot.areas.find((area) => area.areaId === 'area-2');
    expect(area1?.realR).toBeCloseTo(66.244, 3);
    expect(area1?.potentialP).toBe(80);
    expect(area2?.realR).toBe(60);
    expect(area2?.potentialP).toBe(90);
    expect(snapshot.rankingGlobal).toBe(63);
  });

  it('rejects closing an already closed set', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/questions/set-closed/close',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
