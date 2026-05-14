import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RunReplayDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  auditId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  initialContextOverride?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  responseFormatPromptOverride?: string;
}
