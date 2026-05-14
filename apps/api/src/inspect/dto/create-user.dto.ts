import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}
