import { ApiProperty } from '@nestjs/swagger';

export class CreateGuidanceDto {
  @ApiProperty()
  areaId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;
}
