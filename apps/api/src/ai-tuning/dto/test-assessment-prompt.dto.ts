import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
