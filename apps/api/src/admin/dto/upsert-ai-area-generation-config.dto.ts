import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertAiAreaGenerationConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  areaId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  initialContext: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  responseFormatPrompt: string;

  @ApiProperty()
  @Allow()
  questionnaireLayoutJson: unknown;
}
