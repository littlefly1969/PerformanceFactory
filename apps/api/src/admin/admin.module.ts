import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AiOrchestratorModule } from '../ai-orchestrator/ai-orchestrator.module';
import { AdminService } from './admin.service';
import { ConsentsModule } from '../consents/consents.module';

@Module({
  imports: [AiOrchestratorModule, ConsentsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
