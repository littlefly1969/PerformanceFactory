import { AthleteModule } from './athlete/athlete.module';
import { Logger, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { GuidanceModule } from './guidance/guidance.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { UserPlanModule } from './user-plan/user-plan.module';
import { ConsentsModule } from './consents/consents.module';
import { AreasModule } from './areas/areas.module';
import { PerformanceModule } from './performance/performance.module';
import { PlansModule } from './plans/plans.module';
import { QuestionsModule } from './questions/questions.module';
import { AnswersModule } from './answers/answers.module';
import { AiOrchestratorModule } from './ai-orchestrator/ai-orchestrator.module';
import { AdminModule } from './admin/admin.module';
import { ProfessionalModule } from './professional/professional.module';
import { CyclesModule } from './cycles/cycles.module';
import { InspectModule } from './inspect/inspect.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { AiTuningModule } from './ai-tuning/ai-tuning.module';

function buildThrottlerStorage() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'REDIS_URL e obbligatorio in produzione per il rate limiter',
      );
    }
    new Logger('Throttler').warn(
      'REDIS_URL assente, rate limiter in modalita in-memory (solo dev)',
    );
    return undefined;
  }
  return new ThrottlerStorageRedisService(redisUrl);
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            name: 'register-athlete',
            ttl: 15 * 60 * 1000,
            limit: 3,
          },
        ],
        storage: buildThrottlerStorage(),
      }),
    }),
    PrismaModule,
    AthleteModule,
    AuthModule,
    RelationshipsModule,
    GuidanceModule,
    AssignmentsModule,
    UserPlanModule,
    ConsentsModule,
    AreasModule,
    PerformanceModule,
    PlansModule,
    QuestionsModule,
    AnswersModule,
    AiOrchestratorModule,
    AdminModule,
    ProfessionalModule,
    CyclesModule,
    InspectModule,
    OnboardingModule,
    AiTuningModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
