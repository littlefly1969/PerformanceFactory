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
import { ConsentsService } from '../src/consents/consents.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createPrismaTestFake } from './utils/prisma-test-fake';

type InjectResponse = {
  statusCode: number;
  json: () => unknown;
};

type InjectFn = (options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
}) => Promise<InjectResponse>;

type OnboardingCase = {
  userId: string;
  expectedRequired: boolean;
  assessment: {
    status: string;
    completedAt: Date | null;
    updatedAt: Date;
  } | null;
  goal: {
    goalText: string;
    frozenAt: Date | null;
  } | null;
};

const frozenAt = new Date('2026-05-01T10:00:00.000Z');
const updatedAt = new Date('2026-05-01T11:00:00.000Z');

const onboardingCases: OnboardingCase[] = [
  {
    userId: 'no-assessment',
    expectedRequired: true,
    assessment: null,
    goal: null,
  },
  {
    userId: 'assessment-without-goal',
    expectedRequired: true,
    assessment: { status: 'COMPLETED', completedAt: frozenAt, updatedAt },
    goal: null,
  },
  {
    userId: 'goal-not-frozen',
    expectedRequired: true,
    assessment: { status: 'COMPLETED', completedAt: frozenAt, updatedAt },
    goal: { goalText: 'Migliorare la performance in gara', frozenAt: null },
  },
  {
    userId: 'goal-frozen',
    expectedRequired: false,
    assessment: { status: 'COMPLETED', completedAt: frozenAt, updatedAt },
    goal: {
      goalText: 'Migliorare la performance in gara',
      frozenAt,
    },
  },
];

const caseByUserId = new Map(
  onboardingCases.map((item) => [item.userId, item]),
);

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string>;
      user?: unknown;
      raw?: { user?: unknown };
    }>();
    const userId = request.headers?.['x-test-user-id'];

    if (!userId) {
      return false;
    }

    const user = {
      id: userId,
      email: `${userId}@example.com`,
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

const makePrismaMock = () =>
  createPrismaTestFake({
    consent: {
      findFirst: () => null,
    },
    userOnboardingAssessment: {
      findUnique: ({ where }: { where: { userId: string } }) =>
        caseByUserId.get(where.userId)?.assessment ?? null,
    },
    userPerformanceGoal: {
      findUnique: ({ where }: { where: { userId: string } }) => {
        const goal = caseByUserId.get(where.userId)?.goal;
        if (!goal) {
          return null;
        }
        return {
          ...goal,
          interpretedGoal: null,
          normalizedGoal: null,
          goalEvaluation: null,
          suggestedReformulatedGoal: null,
          questionsToUser: [],
          nextStep: null,
          validationStatus: 'OK',
          validationMessage: null,
          updatedAt,
        };
      },
    },
    userSportSelection: {
      findUnique: () => null,
    },
  });

describe('Onboarding status alignment (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(makePrismaMock())
      .overrideProvider(ConsentsService)
      .useValue({
        status: () => ({
          required: false,
          missingConsents: [],
          documents: [],
          acceptedConsents: [],
        }),
      })
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

  it.each(onboardingCases)(
    'returns aligned auth onboardingRequired for $userId',
    async ({ userId, expectedRequired }) => {
      const response = await inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { 'x-test-user-id': userId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: userId,
        onboardingRequired: expectedRequired,
      });
    },
  );

  it.each(onboardingCases)(
    'returns aligned onboarding status required for $userId',
    async ({ userId, expectedRequired }) => {
      const response = await inject({
        method: 'GET',
        url: '/api/onboarding/status',
        headers: { 'x-test-user-id': userId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        required: expectedRequired,
      });
    },
  );
});
