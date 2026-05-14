import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PromptVariantDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  initialContext?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  responseFormatPrompt?: string;
}

export class CreateEvaluationRunDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  goldenContextIds: string[];

  @ApiProperty({ type: [PromptVariantDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PromptVariantDto)
  variants: PromptVariantDto[];
}
