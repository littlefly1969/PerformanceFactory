import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiOrchestratorModule } from '../ai-orchestrator/ai-orchestrator.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [PrismaModule, AiOrchestratorModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
