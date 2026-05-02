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
  const links = [
    { professionalId: 'pro-1', userId: 'user-1', areaId: 'area-1' },
  ];

  const snapshots = [
    {
      id: 'snapshot-1',
      userId: 'user-1',
      rankingGlobal: 64,
      reason: 'baseline',
      createdAt: new Date(),
      areas: [
        {
          areaId: 'area-1',
          realR: 60,
          potentialP: 80,
          area: { id: 'area-1', name: 'Footwork' },
        },
      ],
    },
  ];

  return {
    professionalUserLink: {
      findFirst: ({
        where,
      }: {
        where: { professionalId: string; userId: string; areaId?: string };
      }) => {
        return (
          links.find(
            (link) =>
              link.professionalId === where.professionalId &&
              link.userId === where.userId &&
              (!where.areaId || link.areaId === where.areaId),
          ) ?? null
        );
      },
    },
    professionalAreaCompetence: {
      findMany: ({ where }: { where: { professionalId: string } }) => {
        if (where.professionalId === 'pro-1') {
          return [{ areaId: 'area-1' }];
        }
        return [];
      },
    },
    performanceProfileSnapshot: {
      findFirst: ({ where }: { where: { userId: string } }) =>
        snapshots.find((snapshot) => snapshot.userId === where.userId) ?? null,
    },
    dataAccessAudit: {
      create: jest.fn(),
    },
  } as unknown as PrismaService;
};

describe('Performance (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;

  beforeAll(async () => {
    const prismaMock = makePrismaMock();
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

    const fastify = app.getHttpAdapter().getInstance() as unknown as {
      inject: InjectFn;
    };
    inject = fastify.inject.bind(fastify) as InjectFn;
  });

  afterAll(async () => {
    await app.close();
  });

  it('enforces ABAC for professional viewing users', async () => {
    const allowed = await inject({
      method: 'GET',
      url: '/api/performance/profile/current?userId=user-1',
      headers: {
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
    });

    expect(allowed.statusCode).toBe(200);

    const denied = await inject({
      method: 'GET',
      url: '/api/performance/profile/current?userId=user-2',
      headers: {
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
    });

    expect(denied.statusCode).toBe(403);
    expect(JSON.stringify(allowed.json())).not.toContain('password');
  });
});
