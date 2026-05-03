import { ApiProperty } from '@nestjs/swagger';

export class UpsertGoalPromptConfigDto {
  @ApiProperty({ required: false })
  id?: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  basePrompt: string;

  @ApiProperty({ required: false })
  isActive?: boolean;
}
