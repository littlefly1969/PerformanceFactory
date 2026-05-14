import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiOrchestratorModule } from '../ai-orchestrator/ai-orchestrator.module';
import { AiTuningController } from './ai-tuning.controller';
import { AiTuningService } from './ai-tuning.service';

@Module({
  imports: [PrismaModule, AiOrchestratorModule],
  controllers: [AiTuningController],
  providers: [AiTuningService],
})
export class AiTuningModule {}
