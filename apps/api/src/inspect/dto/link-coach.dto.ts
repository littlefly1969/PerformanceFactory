import { ApiProperty } from '@nestjs/swagger';

export class AdminLinkCoachDto {
  @ApiProperty()
  coachId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  specializationId: string;
}
