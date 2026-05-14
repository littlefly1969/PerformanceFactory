import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAnswerOptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  score?: number;
}
