import { TrainingLifecycleModule } from '../training-lifecycle/training-lifecycle.module';
import { Module } from '@nestjs/common';
import { AnswersController } from './answers.controller';
import { AnswersService } from './answers.service';
import { AiOrchestratorModule } from '../ai-orchestrator/ai-orchestrator.module';

@Module({
  imports: [TrainingLifecycleModule, AiOrchestratorModule],
  controllers: [AnswersController],
  providers: [AnswersService],
})
export class AnswersModule {}
