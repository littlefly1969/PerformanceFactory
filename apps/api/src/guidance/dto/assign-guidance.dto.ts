import { ApiProperty } from '@nestjs/swagger';

export class AssignGuidanceDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  contentId: string;
}
