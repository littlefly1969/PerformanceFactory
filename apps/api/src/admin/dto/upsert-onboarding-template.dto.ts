import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OnboardingInputType, OnboardingQuestionScope } from '@prisma/client';
import {
  Allow,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpsertOnboardingTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key: string;

  @ApiProperty({ enum: OnboardingQuestionScope })
  @IsEnum(OnboardingQuestionScope)
  scope: OnboardingQuestionScope;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(64)
  areaId?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  label: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(2000)
  helpText?: string | null;

  @ApiProperty({ enum: OnboardingInputType })
  @IsEnum(OnboardingInputType)
  inputType: OnboardingInputType;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  optionsJson?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(10000)
  orderIndex: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
