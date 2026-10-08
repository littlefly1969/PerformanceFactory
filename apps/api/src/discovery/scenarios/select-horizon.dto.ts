import { ApiProperty } from '@nestjs/swagger';
import { ProgramHorizon } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SelectHorizonDto {
  @ApiProperty({ enum: ProgramHorizon })
  @IsEnum(ProgramHorizon)
  horizon: ProgramHorizon;
}
