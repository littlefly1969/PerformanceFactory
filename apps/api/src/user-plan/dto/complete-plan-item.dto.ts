import { ApiPropertyOptional } from '@nestjs/swagger';

export class CompletePlanItemDto {
  @ApiPropertyOptional()
  completionNotes?: string;

  @ApiPropertyOptional()
  completionRating?: number;
}
