import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { UpsertGoalPromptConfigDto } from '../../admin/dto/upsert-goal-prompt-config.dto';

/** Stessa forma del prompt obiettivo: nome, testo e attivazione, più la famiglia. */
export class UpsertAssessmentPromptConfigDto extends UpsertGoalPromptConfigDto {
  /** EVALUATION (default) o CALIBRATION; ignorata quando si aggiorna un prompt esistente. */
  @ApiPropertyOptional({ enum: ['EVALUATION', 'CALIBRATION'] })
  @IsOptional()
  @IsIn(['EVALUATION', 'CALIBRATION'])
  kind?: 'EVALUATION' | 'CALIBRATION';
}
