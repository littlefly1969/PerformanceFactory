import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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

  /** CALIBRATION prova le domande dei round, solo sul caso sintetico. */
  @ApiPropertyOptional({ enum: ['EVALUATION', 'CALIBRATION'] })
  @IsOptional()
  @IsIn(['EVALUATION', 'CALIBRATION'])
  kind?: 'EVALUATION' | 'CALIBRATION';
}
