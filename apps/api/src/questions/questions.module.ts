import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { UserQuestionsController } from './user-questions.controller';
import { QuestionsService } from './questions.service';
import { AbacService } from '../common/policies/abac.service';
import { AiOrchestratorModule } from '../ai-orchestrator/ai-orchestrator.module';

@Module({
  imports: [AiOrchestratorModule],
  controllers: [QuestionsController, UserQuestionsController],
  providers: [QuestionsService, AbacService],
})
export class QuestionsModule {}
