import { ApiProperty } from '@nestjs/swagger';

export class AssignCompetenceDto {
  @ApiProperty()
  professionalId: string;

  @ApiProperty({ type: [String] })
  areaIds: string[];
}
