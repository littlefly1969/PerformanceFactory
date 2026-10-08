import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { UpsertGoalPromptConfigDto } from '../../admin/dto/upsert-goal-prompt-config.dto';
import {
  ASSESSMENT_PROMPT_KINDS,
  type AssessmentPromptKind,
} from '../../ai-orchestrator/assessment-prompts';

/** Stessa forma del prompt obiettivo: nome, testo e attivazione, più la famiglia. */
export class UpsertAssessmentPromptConfigDto extends UpsertGoalPromptConfigDto {
  /** EVALUATION (default), CALIBRATION o MICRO_TEST; ignorata quando si aggiorna un prompt esistente. */
  @ApiPropertyOptional({ enum: ASSESSMENT_PROMPT_KINDS })
  @IsOptional()
  @IsIn(ASSESSMENT_PROMPT_KINDS)
  kind?: AssessmentPromptKind;
}
