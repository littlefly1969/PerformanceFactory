import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateBy,
  ValidateNested,
} from 'class-validator';

const isOnboardingAnswerValue = (value: unknown) =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

export class OnboardingAnswerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  questionId: string;

  @ApiProperty({ nullable: true })
  @ValidateBy({
    name: 'isOnboardingAnswerValue',
    validator: {
      validate: isOnboardingAnswerValue,
      defaultMessage: () => 'value must be a string, number, boolean, or null',
    },
  })
  value: string | number | boolean | null;
}

export class GoalTextDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goalText?: string;
}

export class SportSelectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sportId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  specializationId?: string;
}

export class GoalChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  content: string;
}

export class RefineGoalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  originalGoal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  currentDraft?: string;

  @ApiPropertyOptional({ type: [GoalChatMessageDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GoalChatMessageDto)
  messages?: GoalChatMessageDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  userReply?: string;
}

export class OnboardingAnswersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goalText?: string;

  @ApiPropertyOptional({ type: [OnboardingAnswerDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OnboardingAnswerDto)
  answers?: OnboardingAnswerDto[];
}
