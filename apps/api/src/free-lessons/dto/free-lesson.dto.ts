import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RequestFreeLessonDto {
  @ApiProperty()
  @IsUUID()
  partnerId: string;

  /** Consenso a mostrare al coach nome, livello stimato e driver. */
  @ApiProperty()
  @Equals(true, { message: 'Serve il consenso a condividere il livello' })
  shareWithCoach: boolean;
}

export class UpdateFreeLessonConfigDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  creditsToUnlock?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  creditsInitialAssessment?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  creditsCalibrationRound?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  creditsMicroTest?: number;
}

export class SetClubFreeLessonsDto {
  @ApiProperty()
  @IsBoolean()
  freeLessonsEnabled: boolean;
}

export class CreateFreeLessonDto {
  @ApiProperty()
  @IsUUID()
  partnerId: string;

  @ApiProperty({ description: 'Data e ora di inizio (ISO 8601)' })
  @IsDateString()
  startsAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  coachId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 8, default: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  levelLabel?: string;
}

export class SetLessonCoachDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  coachId?: string | null;
}

export class AssignSeatDto {
  @ApiProperty()
  @IsUUID()
  userId: string;
}

class MicroTestOptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  value: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @ApiProperty()
  @IsNumber()
  score: number;
}

export class CreateMicroTestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  areaId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  instructions: string;

  @ApiProperty({ type: [MicroTestOptionDto] })
  @ValidateNested({ each: true })
  @Type(() => MicroTestOptionDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  options: MicroTestOptionDto[];
}

export class SetMicroTestActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

class CoachRatingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  areaId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;
}

export class CoachFeedbackDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ type: [CoachRatingDto] })
  @ValidateNested({ each: true })
  @Type(() => CoachRatingDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  ratings: CoachRatingDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CoachNoShowDto {
  @ApiProperty()
  @IsUUID()
  userId: string;
}
