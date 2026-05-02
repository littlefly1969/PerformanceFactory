import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAnswerOptionDto {
  @ApiPropertyOptional()
  label?: string;

  @ApiPropertyOptional()
  score?: number;
}
