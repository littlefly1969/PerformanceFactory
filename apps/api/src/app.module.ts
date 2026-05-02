import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    PrismaModule,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
