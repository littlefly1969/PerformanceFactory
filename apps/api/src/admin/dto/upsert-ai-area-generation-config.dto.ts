import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertAiAreaGenerationConfigDto {
  @ApiPropertyOptional()
  id?: string;

  @ApiProperty()
  areaId: string;

  @ApiProperty()
  initialContext: string;

  @ApiProperty()
  responseFormatPrompt: string;

  @ApiProperty()
  questionnaireLayoutJson: unknown;
}
