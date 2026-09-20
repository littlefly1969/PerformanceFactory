import { Module } from '@nestjs/common';
import { AthleteController } from './athlete.controller';
import { AthleteService } from './athlete.service';
@Module({ controllers: [AthleteController], providers: [AthleteService] })
export class AthleteModule {}
