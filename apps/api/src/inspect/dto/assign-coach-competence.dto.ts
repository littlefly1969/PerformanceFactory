import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class AssignCoachCompetenceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  coachId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  specializationIds: string[];
}
