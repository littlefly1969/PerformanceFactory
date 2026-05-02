import { Module } from '@nestjs/common';
import { ConsentsController } from './consents.controller';

@Module({
  controllers: [ConsentsController],
})
export class ConsentsModule {}
