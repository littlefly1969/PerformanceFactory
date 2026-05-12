import { ApiProperty } from '@nestjs/swagger';

export class AssignCoachCompetenceDto {
  @ApiProperty()
  coachId: string;

  @ApiProperty({ type: [String] })
  specializationIds: string[];
}
