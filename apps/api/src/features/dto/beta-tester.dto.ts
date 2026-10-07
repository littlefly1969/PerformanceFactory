import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, MaxLength } from 'class-validator';

export class SetBetaTesterDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty()
  @IsBoolean()
  isBetaTester: boolean;
}
