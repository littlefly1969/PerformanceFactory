import { User } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AthleteModule } from '../../src/athlete/athlete.module';
import { AnswersModule } from '../../src/answers/answers.module';
import { signAccessToken } from '../../src/common/auth-token';
import {
  REQUIRED_CONSENTS,
  consentDocumentHash,
} from '../../src/consents/consent-texts';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

type TestUser = User & { headers: { authorization: string } };
type LifecycleFixture = {
  app: NestFastifyApplication;
  prisma: PrismaService;
  user: (
    role?: 'USER' | 'PROFESSIONAL' | 'ADMIN',
    eligible?: boolean,
  ) => Promise<TestUser>;
  coach: () => Promise<TestUser>;
  specializationId: string;
  cleanup: () => Promise<void>;
};
export async function lifecycleFixture(): Promise<LifecycleFixture> {
  process.env.DATABASE_URL = getRequiredTestDatabaseUrl();
  process.env.AI_PROVIDER = 'stub';
  process.env.TRAINING_APPROVAL_MODE = 'AUTO';
  await ensureTestDatabaseExists(process.env.DATABASE_URL);
  execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '../..'),
    env: process.env,
    stdio: 'pipe',
  });
  const module = await Test.createTestingModule({
    imports: [PrismaModule, AthleteModule, AnswersModule],
  }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const prisma = app.get(PrismaService);
  const userIds: string[] = [];
  const sport = await prisma.sport.create({
    data: {
      key: `lifecycle-${randomUUID()}`,
      label: 'Lifecycle sport',
      specializations: {
        create: {
          key: 'standard',
          label: 'Standard',
          trainingPrompt: 'Genera tre allenamenti progressivi e un check-in.',
        },
      },
    },
    include: { specializations: true },
  });
  const specializationId = sport.specializations[0].id;
  async function user(
    role: 'USER' | 'PROFESSIONAL' | 'ADMIN' = 'USER',
    eligible = true,
  ) {
    const created = await prisma.user.create({
      data: {
        email: `lifecycle-${randomUUID()}@example.test`,
        password: 'unused',
        role,
        firstName: 'Test',
        ...(role === 'USER'
          ? {
              sportSelection: {
                create: { sportId: sport.id, specializationId },
              },
              onboardingAssessment: {
                create: {
                  status: eligible ? 'COMPLETED' : 'PENDING',
                  answersJson: {},
                  profileJson: {
                    summary: 'Profilo reale test',
                    general_training_frequency: { value: '2_3' },
                    training_days_available: { value: 4 },
                    training_session_duration: { value: 60 },
                    program_duration_weeks: { value: 12 },
                  },
                },
              },
              performanceGoal: {
                create: {
                  goalText: 'Migliorare la resistenza durante la partita',
                },
              },
            }
          : {}),
      },
    });
    userIds.push(created.id);
    await prisma.consent.createMany({
      data: REQUIRED_CONSENTS.map((c) => ({
        userId: created.id,
        type: c.type,
        version: c.version,
        documentHash: consentDocumentHash(c),
      })),
    });
    return {
      ...created,
      headers: {
        authorization: `Bearer ${signAccessToken(created).accessToken}`,
      },
    };
  }
  async function coach() {
    const created = await user('PROFESSIONAL');
    await prisma.coachSpecializationCompetence.create({
      data: { coachId: created.id, specializationId },
    });
    return created;
  }
  async function cleanup() {
    const where = { userId: { in: userIds } };
    await prisma.trainingUserAnswer.deleteMany({ where });
    await prisma.trainingLifecycleOperation.deleteMany({ where });
    await prisma.trainingPlanRelease.deleteMany({ where });
    await prisma.aiProposalAudit.deleteMany({ where });
    await prisma.aiContextSummary.deleteMany({ where });
    await prisma.cycleAuditLog.deleteMany({ where });
    await prisma.userOnboardingAssessment.deleteMany({ where });
    await prisma.userPerformanceGoal.deleteMany({ where });
    await prisma.consent.deleteMany({ where });
    await prisma.coachUserLink.deleteMany({ where });
    await prisma.coachSpecializationCompetence.deleteMany({
      where: { coachId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.sport.delete({ where: { id: sport.id } });
    await app.close();
  }
  return { app, prisma, user, coach, specializationId, cleanup };
}
