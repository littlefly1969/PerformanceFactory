import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateGuidanceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  areaId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  body: string;
}
