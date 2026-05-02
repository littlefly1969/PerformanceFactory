import { Module } from '@nestjs/common';
import { RelationshipsService } from './relationships.service';
import { RelationshipsController } from './relationships.controller';
import { AbacService } from '../common/policies/abac.service';

@Module({
  controllers: [RelationshipsController],
  providers: [RelationshipsService, AbacService],
})
export class RelationshipsModule {}
