import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RunCycleDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(64, { each: true })
  userIds: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  areaId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  runAllAreas?: boolean;
}
