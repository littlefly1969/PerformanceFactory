import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TestAssessmentPromptDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  basePrompt: string;
}
