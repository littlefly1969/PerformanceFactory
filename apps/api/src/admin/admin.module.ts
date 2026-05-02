import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AiOrchestratorModule } from '../ai-orchestrator/ai-orchestrator.module';
import { AdminService } from './admin.service';

@Module({
  imports: [AiOrchestratorModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
