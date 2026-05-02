import { Module } from '@nestjs/common';
import { InspectController } from './inspect.controller';
import { InspectService } from './inspect.service';

@Module({
  controllers: [InspectController],
  providers: [InspectService],
})
export class InspectModule {}
