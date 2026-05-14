import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class AssignCompetenceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  professionalId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  areaIds: string[];
}
