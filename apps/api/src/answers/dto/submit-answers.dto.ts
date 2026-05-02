import { ApiProperty } from '@nestjs/swagger';

export class AnswerSubmissionDto {
  @ApiProperty()
  questionId: string;

  @ApiProperty()
  answerOptionId: string;
}

export class SubmitAnswersDto {
  @ApiProperty()
  questionSetId: string;

  @ApiProperty({ type: [AnswerSubmissionDto] })
  answers: AnswerSubmissionDto[];
}
