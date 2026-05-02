import { Module } from '@nestjs/common';
import { CyclesController } from './cycles.controller';
import { CyclesService } from './cycles.service';
import { ProfessionalModule } from '../professional/professional.module';

@Module({
  imports: [ProfessionalModule],
  controllers: [CyclesController],
  providers: [CyclesService],
})
export class CyclesModule {}
