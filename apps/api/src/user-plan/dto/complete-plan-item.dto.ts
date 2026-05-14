import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CompletePlanItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  completionNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  completionRating?: number;
}
