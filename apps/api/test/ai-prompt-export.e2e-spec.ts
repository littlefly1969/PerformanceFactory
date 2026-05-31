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
import { AiTuningService } from '../src/ai-tuning/ai-tuning.service';
import { AuthenticatedGuard } from '../src/common/guards/authenticated.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyValidationPipe } from './utils/apply-validation-pipe';

type InjectResponse = {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
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

describe('AI prompt active export endpoint (e2e)', () => {
  let app: INestApplication;
  let inject: InjectFn;

  const exportActivePrompts = jest.fn().mockResolvedValue({
    filename: 'active-ai-prompts-20260531-123456.txt',
    content: 'PerformanceFactory - Export prompt AI attivi\nPrompt attivo\n',
    counts: {
      goalPromptConfigs: 1,
      areaGenerationConfigs: 0,
      sportSpecializationAreaPrompts: 0,
      trainingPrompts: 0,
      onboardingQuestionTemplates: 0,
    },
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({} as PrismaService)
      .overrideProvider(OrchestratorService)
      .useValue({} as OrchestratorService)
      .overrideProvider(AiTuningService)
      .useValue({ exportActivePrompts })
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

  afterEach(() => {
    exportActivePrompts.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets AI tuner download active prompts as plain text', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/ai-tuning/active-prompts/export',
      headers: {
        'x-test-user-id': 'tuner-1',
        'x-test-role': UserRole.AI_TUNER,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.headers['content-type'])).toContain('text/plain');
    expect(String(response.headers['content-disposition'])).toContain(
      'active-ai-prompts-20260531-123456.txt',
    );
    expect(String(response.headers['content-disposition'])).toContain(
      "filename*=UTF-8''active-ai-prompts-20260531-123456.txt",
    );
    expect(String(response.headers['content-length'])).toBe(
      Buffer.byteLength(response.body, 'utf8').toString(),
    );
    expect(response.body).toContain('Prompt attivo');
    expect(exportActivePrompts).toHaveBeenCalledTimes(1);
  });

  it('lets admin download active prompts as plain text', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/ai-tuning/active-prompts/export',
      headers: {
        'x-test-user-id': 'admin-1',
        'x-test-role': UserRole.ADMIN,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(exportActivePrompts).toHaveBeenCalledTimes(1);
  });

  it('rejects normal users', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/ai-tuning/active-prompts/export',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-role': UserRole.USER,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(exportActivePrompts).not.toHaveBeenCalled();
  });
});
