import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OnboardingInputType, OnboardingQuestionScope } from '@prisma/client';

export class UpsertOnboardingTemplateDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiProperty()
  key: string;

  @ApiProperty({ enum: OnboardingQuestionScope })
  scope: OnboardingQuestionScope;

  @ApiPropertyOptional()
  areaId?: string | null;

  @ApiProperty()
  label: string;

  @ApiPropertyOptional()
  helpText?: string | null;

  @ApiProperty({ enum: OnboardingInputType })
  inputType: OnboardingInputType;

  @ApiPropertyOptional()
  optionsJson?: unknown;

  @ApiPropertyOptional()
  required?: boolean;

  @ApiProperty()
  orderIndex: number;

  @ApiPropertyOptional()
  isActive?: boolean;
}
