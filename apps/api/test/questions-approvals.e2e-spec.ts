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
import { OrchestratorService } from '../src/ai-orchestrator/orchestrator.service';

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
  const questionSets = [
    {
      id: 'set-pending',
      userId: 'user-2',
      areaId: 'area-1',
      status: 'PENDING_APPROVAL',
    },
    {
      id: 'set-published',
      userId: 'user-1',
      areaId: 'area-1',
      status: 'PUBLISHED',
    },
  ];

  const approvals = [
    {
      id: 'approval-1',
      questionSetId: 'set-pending',
      areaId: 'area-1',
      professionalId: 'pro-1',
      status: 'PENDING',
    },
    {
      id: 'approval-2',
      questionSetId: 'set-pending',
      areaId: 'area-2',
      professionalId: 'pro-2',
      status: 'PENDING',
    },
  ];

  return {
    questionSet: {
      findFirst: ({
        where,
      }: {
        where: { userId: string; status?: string; areaId?: string };
      }) => {
        return (
          questionSets.find(
            (set) =>
              set.userId === where.userId &&
              (where.areaId ? set.areaId === where.areaId : true) &&
              (where.status ? set.status === where.status : true),
          ) ?? null
        );
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        questionSets.find((set) => set.id === where.id) ?? null,
    },
    questionSetAreaApproval: {
      findUnique: ({
        where,
      }: {
        where: {
          questionSetId_areaId: { questionSetId: string; areaId: string };
        };
      }) =>
        approvals.find(
          (item) =>
            item.questionSetId === where.questionSetId_areaId.questionSetId &&
            item.areaId === where.questionSetId_areaId.areaId,
        ) ?? null,
      update: ({
        where,
        data,
      }: {
        where: {
          questionSetId_areaId: { questionSetId: string; areaId: string };
        };
        data: { status: string };
      }) => {
        const approval = approvals.find(
          (item) =>
            item.questionSetId === where.questionSetId_areaId.questionSetId &&
            item.areaId === where.questionSetId_areaId.areaId,
        );
        if (!approval) {
          return null;
        }
        approval.status = data.status;
        return approval;
      },
    },
    professionalAreaCompetence: {
      findUnique: ({
        where,
      }: {
        where: {
          professionalId_areaId: { professionalId: string; areaId: string };
        };
      }) => {
        if (
          where.professionalId_areaId.professionalId === 'pro-1' &&
          where.professionalId_areaId.areaId === 'area-1'
        ) {
          return { id: 'comp-1' };
        }
        return null;
      },
      findMany: () => [{ areaId: 'area-1' }],
    },
    professionalUserLink: {
      findUnique: () => ({ id: 'link-1' }),
    },
  } as unknown as PrismaService;
};

describe('Question approvals + visibility (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;
  const orchestratorMock = {
    createSnapshotFromQuestionSet: () =>
      Promise.resolve({ snapshotId: 'snap-1' }),
    refreshCycleReadiness: () =>
      Promise.resolve({
        planReleaseId: 'plan-1',
        cycleStatus: 'WAITING_APPROVALS',
      }),
    rejectCycleProposal: () =>
      Promise.resolve({ planReleaseId: 'plan-1', status: 'REJECTED' }),
  } as unknown as OrchestratorService;

  beforeAll(async () => {
    const prismaMock = makePrismaMock();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
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
    inject = fastify.inject.bind(fastify) as InjectFn;
  });

  afterAll(async () => {
    await app.close();
  });

  it('user does not see PENDING question set', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/questions/current?userId=user-2&areaId=area-1',
      headers: {
        'x-test-user-id': 'user-2',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('professional cannot approve area without competence', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/questions/set-pending/areas/area-2/approve',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
      payload: JSON.stringify({ notes: 'ok' }),
    });

    expect(response.statusCode).toBe(403);
  });

  it('close is allowed only for PUBLISHED question set', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/questions/set-published/close',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(201);
  });
});
