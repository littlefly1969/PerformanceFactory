import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertGoldenContextDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  areaId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  athleteLevel?: string;

  @ApiProperty()
  @Allow()
  contextJson: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
