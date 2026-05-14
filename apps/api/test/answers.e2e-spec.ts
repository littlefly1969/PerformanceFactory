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
  const questionSets = [
    {
      id: 'set-1',
      userId: 'user-1',
      status: 'PUBLISHED',
      questions: [
        {
          id: 'q1',
          options: [
            { id: 'o1', score: 0 },
            { id: 'o2', score: 50 },
          ],
        },
        {
          id: 'q2',
          options: [
            { id: 'o3', score: 75 },
            { id: 'o4', score: 100 },
          ],
        },
      ],
    },
    {
      id: 'set-2',
      userId: 'user-1',
      status: 'PENDING_APPROVAL',
      questions: [
        {
          id: 'q3',
          options: [
            { id: 'o5', score: 25 },
            { id: 'o6', score: 75 },
          ],
        },
      ],
    },
    {
      id: 'set-3',
      userId: 'user-2',
      status: 'PUBLISHED',
      questions: [
        {
          id: 'q4',
          options: [
            { id: 'o7', score: 10 },
            { id: 'o8', score: 90 },
          ],
        },
      ],
    },
  ];

  const answers: Array<{
    userId: string;
    questionId: string;
    answerOptionId: string;
    scoreAwarded: number;
  }> = [];

  const prismaMock = {
    questionSet: {
      findUnique: ({ where }: { where: { id: string } }) =>
        questionSets.find((set) => set.id === where.id) ?? null,
    },
    userAnswer: {
      findMany: ({
        where,
      }: {
        where: { userId: string; questionId: { in: string[] } };
      }) =>
        answers.filter(
          (answer) =>
            answer.userId === where.userId &&
            where.questionId.in.includes(answer.questionId),
        ),
      createMany: ({ data }: { data: typeof answers }) => {
        answers.push(...data);
        return { count: data.length };
      },
    },
  } as unknown as PrismaService;

  return { prismaMock, answers };
};

describe('Answers (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;
  let answers: Array<{
    userId: string;
    questionId: string;
    answerOptionId: string;
    scoreAwarded: number;
  }>;

  beforeAll(async () => {
    const mock = makePrismaMock();
    answers = mock.answers;

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

  it('submits answers and creates user answers', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/answers/batch',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
      payload: JSON.stringify({
        questionSetId: 'set-1',
        answers: [
          { questionId: 'q1', answerOptionId: 'o2' },
          { questionId: 'q2', answerOptionId: 'o4' },
        ],
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(answers).toHaveLength(2);
    expect(answers[0]).toMatchObject({
      userId: 'user-1',
      questionId: 'q1',
      answerOptionId: 'o2',
      scoreAwarded: 50,
    });
  });

  it('rejects answers for non-published question sets', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/answers/batch',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
      payload: JSON.stringify({
        questionSetId: 'set-2',
        answers: [{ questionId: 'q3', answerOptionId: 'o5' }],
      }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects answers for other users question sets', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/answers/batch',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
      payload: JSON.stringify({
        questionSetId: 'set-3',
        answers: [{ questionId: 'q4', answerOptionId: 'o7' }],
      }),
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects duplicate questions in payload', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/answers/batch',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
      payload: JSON.stringify({
        questionSetId: 'set-1',
        answers: [
          { questionId: 'q1', answerOptionId: 'o2' },
          { questionId: 'q1', answerOptionId: 'o1' },
        ],
      }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects answers already submitted', async () => {
    answers.push({
      userId: 'user-1',
      questionId: 'q2',
      answerOptionId: 'o4',
      scoreAwarded: 100,
    });

    const response = await inject({
      method: 'POST',
      url: '/api/answers/batch',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
      payload: JSON.stringify({
        questionSetId: 'set-1',
        answers: [{ questionId: 'q2', answerOptionId: 'o4' }],
      }),
    });

    expect(response.statusCode).toBe(400);
  });
});
