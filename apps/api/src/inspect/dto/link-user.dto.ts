import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AdminLinkUserDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  professionalId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  areaId: string;
}
