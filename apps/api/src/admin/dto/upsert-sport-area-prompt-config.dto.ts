import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertSportAreaPromptConfigDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiProperty()
  sportKey: string;

  @ApiPropertyOptional()
  fitnessLocation?: string | null;

  @ApiProperty()
  areaId: string;

  @ApiProperty()
  basePrompt: string;

  @ApiPropertyOptional()
  isActive?: boolean;
}
