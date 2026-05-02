import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateQuestionDto {
  @ApiPropertyOptional()
  text?: string;

  @ApiPropertyOptional()
  objectiveRef?: string;

  @ApiPropertyOptional()
  orderIndex?: number;
}
