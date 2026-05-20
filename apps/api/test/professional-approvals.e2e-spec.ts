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
import {
  createCoachUserLinkDelegate,
  createPrismaTestFake,
  createProfessionalUserLinkDelegate,
} from './utils/prisma-test-fake';

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
  const planItems = [
    {
      id: 'pi-1',
      status: 'PROPOSED',
      areaId: 'area-1',
      planReleaseId: 'plan-1',
      planRelease: { userId: 'user-1', status: 'PENDING_APPROVAL' },
    },
    {
      id: 'pi-2',
      status: 'PROPOSED',
      areaId: 'area-2',
      planReleaseId: 'plan-1',
      planRelease: { userId: 'user-2', status: 'PENDING_APPROVAL' },
    },
  ];

  const approvals = [
    {
      id: 'qa-1',
      questionSetId: 'qs-1',
      professionalId: 'pro-1',
      areaId: 'area-1',
      status: 'PENDING',
      questionSet: {
        userId: 'user-1',
        status: 'PENDING_APPROVAL',
        planReleaseId: 'plan-1',
        questions: [
          {
            id: 'q-1',
            areaId: 'area-1',
            text: 'Check-in',
            objectiveRef: null,
            orderIndex: 1,
            options: [{ id: 'o-1', label: 'Ok', score: 1 }],
          },
        ],
      },
    },
  ];
  const links = [
    { professionalId: 'pro-1', userId: 'user-1', areaId: 'area-1' },
  ];

  return createPrismaTestFake({
    professionalUserLink: createProfessionalUserLinkDelegate(links),
    coachUserLink: createCoachUserLinkDelegate(),
    professionalAreaCompetence: {
      findMany: ({ where }: { where: { professionalId: string } }) => {
        if (where.professionalId === 'pro-1') {
          return [{ areaId: 'area-1' }];
        }
        return [];
      },
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
    },
    planItem: {
      findMany: () =>
        planItems.filter(
          (item) =>
            item.areaId === 'area-1' && item.planRelease.userId === 'user-1',
        ),
      findUnique: ({ where }: { where: { id: string } }) =>
        planItems.find((item) => item.id === where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string };
      }) => {
        const item = planItems.find((i) => i.id === where.id);
        if (!item) {
          return null;
        }
        item.status = data.status;
        return item;
      },
    },
    questionSetAreaApproval: {
      updateMany: jest.fn(() => ({ count: 0 })),
      findMany: () => approvals,
      findFirst: ({
        where,
      }: {
        where: { questionSetId: string; professionalId: string };
      }) =>
        approvals.find(
          (approval) =>
            approval.questionSetId === where.questionSetId &&
            approval.professionalId === where.professionalId,
        ) ?? null,
      findUnique: ({ where }: { where: { id: string } }) =>
        approvals.find((approval) => approval.id === where.id) ?? null,
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string };
      }) => {
        const approval = approvals.find((a) => a.id === where.id);
        if (!approval) {
          return null;
        }
        approval.status = data.status;
        return approval;
      },
    },
    improvementPlanRelease: {
      findUnique: ({ where }: { where: { id: string } }) => {
        if (where.id !== 'plan-1') {
          return null;
        }
        return {
          id: 'plan-1',
          userId: 'user-1',
          cycleStatus: 'WAITING_APPROVALS',
          status: 'PENDING_APPROVAL',
          questionSets: [
            {
              approvals: approvals.map((approval) => ({
                areaId: approval.areaId,
                status: approval.status,
                area: { id: approval.areaId, name: 'Area 1' },
              })),
            },
          ],
          items: planItems.map((item) => ({
            areaId: item.areaId,
            status: item.status,
            area: { id: item.areaId, name: 'Area 1' },
          })),
        };
      },
    },
    trainingQuestionSetCoachApproval: {
      updateMany: jest.fn(() => ({ count: 0 })),
      findMany: () => [],
    },
    trainingPlanItem: {
      findMany: () => [],
    },
  });
};

describe('Professional approvals workspace (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;

  const orchestratorMock = {
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
    inject = fastify.inject.bind(fastify);
  });

  afterAll(async () => {
    await app.close();
  });

  it('professional inbox only shows linked users and areas', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/professional/approvals',
      headers: {
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
    });

    expect(response.statusCode).toBe(200);
    const data = response.json() as {
      planItems: Array<{ areaId: string }>;
      questionApprovals: Array<{ areaId: string }>;
    };
    expect(data.planItems).toHaveLength(1);
    expect(data.planItems[0].areaId).toBe('area-1');
    expect(data.questionApprovals).toHaveLength(1);
    expect(data.questionApprovals[0].areaId).toBe('area-1');
  });

  it('professional cannot re-approve', async () => {
    const approve = await inject({
      method: 'POST',
      url: '/api/professional/questionsets/qs-1/approve',
      headers: {
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
    });

    expect(approve.statusCode).toBe(201);

    const approveAgain = await inject({
      method: 'POST',
      url: '/api/professional/questionsets/qs-1/approve',
      headers: {
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
      },
    });

    expect(approveAgain.statusCode).toBe(400);
  });

  it('admin can read cycle status but cannot approve', async () => {
    const status = await inject({
      method: 'GET',
      url: '/api/cycles/plan-1/status',
      headers: {
        'x-test-user-id': 'admin-1',
        'x-test-role': UserRole.ADMIN,
      },
    });
    expect(status.statusCode).toBe(200);

    const approve = await inject({
      method: 'POST',
      url: '/api/professional/plan-items/pi-1/approve',
      headers: {
        'x-test-user-id': 'admin-1',
        'x-test-role': UserRole.ADMIN,
      },
    });
    expect(approve.statusCode).toBe(403);
  });

  it('reject requires a reason', async () => {
    const reject = await inject({
      method: 'POST',
      url: '/api/professional/questionsets/qs-1/reject',
      headers: {
        'x-test-user-id': 'pro-1',
        'x-test-role': UserRole.PROFESSIONAL,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ rejectionReason: '' }),
    });

    expect(reject.statusCode).toBe(400);
  });

  it('non-professional cannot access inbox', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/professional/approvals',
      headers: {
        'x-test-user-id': 'admin-1',
        'x-test-role': UserRole.ADMIN,
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
