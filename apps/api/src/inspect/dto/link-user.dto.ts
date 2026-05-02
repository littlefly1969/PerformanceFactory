import { ApiProperty } from '@nestjs/swagger';

export class AdminLinkUserDto {
  @ApiProperty()
  professionalId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  areaId: string;
}
