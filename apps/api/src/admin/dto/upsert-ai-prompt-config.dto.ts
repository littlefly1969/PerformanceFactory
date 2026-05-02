import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertAiPromptConfigDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  basePrompt: string;

  @ApiPropertyOptional()
  areaId?: string | null;

  @ApiProperty()
  athleteLevel: string;

  @ApiPropertyOptional()
  isActive?: boolean;
}
