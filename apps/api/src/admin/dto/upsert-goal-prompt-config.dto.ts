import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertGoalPromptConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  basePrompt: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
