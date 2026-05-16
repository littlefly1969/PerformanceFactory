import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class TestPromptDto {
  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  prompt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional({ enum: ['configured', 'stub', 'openai', 'gemini'] })
  @IsOptional()
  @IsIn(['configured', 'stub', 'openai', 'gemini'])
  provider?: 'configured' | 'stub' | 'openai' | 'gemini';
}
