import { ApiPropertyOptional } from '@nestjs/swagger';

export class LinkUserDto {
  @ApiPropertyOptional()
  userId?: string;

  @ApiPropertyOptional()
  userEmail?: string;

  @ApiPropertyOptional()
  areaId?: string;
}
