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
  const questionSets = [
    {
      id: 'set-1',
      userId: 'user-1',
      areaId: 'area-1',
      status: 'PUBLISHED',
      planReleaseId: 'plan-1',
      type: 'CHECKIN',
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
      questions: [
        {
          id: 'q1',
          areaId: 'area-1',
          text: 'How did you sleep?',
          objectiveRef: null,
          orderIndex: 1,
          area: { id: 'area-1', name: 'Nutrition' },
          options: [
            { id: 'o1', label: 'Poor' },
            { id: 'o2', label: 'Great' },
          ],
        },
      ],
    },
    {
      id: 'set-2',
      userId: 'user-1',
      areaId: 'area-1',
      status: 'PENDING_APPROVAL',
      planReleaseId: 'plan-1',
      type: 'CHECKIN',
      createdAt: new Date('2026-02-02T10:00:00.000Z'),
      questions: [],
    },
    {
      id: 'set-3',
      userId: 'user-2',
      areaId: 'area-1',
      status: 'PUBLISHED',
      planReleaseId: 'plan-2',
      type: 'CHECKIN',
      createdAt: new Date('2026-02-03T10:00:00.000Z'),
      questions: [],
    },
  ];

  const prismaMock = {
    questionSet: {
      findFirst: ({ where }: { where: { userId: string; status?: string; areaId?: string } }) => {
        return (
          questionSets.find((set) => {
            if (set.userId !== where.userId) {
              return false;
            }
            if (where.areaId && set.areaId !== where.areaId) {
              return false;
            }
            if (where.status && set.status !== where.status) {
              return false;
            }
            return true;
          }) ?? null
        );
      },
    },
  } as unknown as PrismaService;

  return { prismaMock };
};

describe('User questions (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;

  beforeAll(async () => {
    const mock = makePrismaMock();

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
    inject = fastify.inject.bind(fastify) as InjectFn;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns published question set for user', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/user/questions/current?areaId=area-1',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { id: string; status: string; userId: string };
    expect(payload.id).toBe('set-1');
    expect(payload.status).toBe('PUBLISHED');
    expect(payload.userId).toBe('user-1');
  });

  it('does not return non-published sets', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/user/questions/current?areaId=area-1',
      headers: {
        'x-test-user-id': 'user-1-nopub',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('does not return sets for other users', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/user/questions/current?areaId=area-1',
      headers: {
        'x-test-user-id': 'user-2',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { userId: string };
    expect(payload.userId).toBe('user-2');
  });

  it('rejects non-user roles', async () => {
    const professional = await inject({
      method: 'GET',
      url: '/api/user/questions/current?areaId=area-1',
      headers: {
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
    });
    expect(professional.statusCode).toBe(403);

    const admin = await inject({
      method: 'GET',
      url: '/api/user/questions/current?areaId=area-1',
      headers: {
        'x-test-user-id': 'admin-1',
        'x-test-role': UserRole.ADMIN,
      },
    });
    expect(admin.statusCode).toBe(403);
  });
});
