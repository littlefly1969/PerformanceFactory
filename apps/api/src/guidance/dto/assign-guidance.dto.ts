import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AssignGuidanceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  contentId: string;
}
