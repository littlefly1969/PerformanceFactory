import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ASSESSMENT_PROMPT_KINDS,
  type AssessmentPromptKind,
} from '../../ai-orchestrator/assessment-prompts';

export class TestAssessmentPromptDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  basePrompt: string;

  /** Valutazione reale scelta esplicitamente; senza, si usa il caso sintetico. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  evaluationId?: string;

  /** CALIBRATION, MICRO_TEST e POTENTIAL si provano solo sul caso sintetico. */
  @ApiPropertyOptional({ enum: ASSESSMENT_PROMPT_KINDS })
  @IsOptional()
  @IsIn(ASSESSMENT_PROMPT_KINDS)
  kind?: AssessmentPromptKind;
}
