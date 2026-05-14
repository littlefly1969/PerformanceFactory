import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AnswerSubmissionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  questionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  answerOptionId: string;
}

export class SubmitAnswersDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  questionSetId: string;

  @ApiProperty({ type: [AnswerSubmissionDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AnswerSubmissionDto)
  answers: AnswerSubmissionDto[];
}
