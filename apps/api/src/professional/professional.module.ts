import { Module } from '@nestjs/common';
import { ProfessionalController } from './professional.controller';
import { ProfessionalService } from './professional.service';
import { AbacService } from '../common/policies/abac.service';
import { AiOrchestratorModule } from '../ai-orchestrator/ai-orchestrator.module';

@Module({
  imports: [AiOrchestratorModule],
  controllers: [ProfessionalController],
  providers: [ProfessionalService, AbacService],
  exports: [ProfessionalService],
})
export class ProfessionalModule {}
