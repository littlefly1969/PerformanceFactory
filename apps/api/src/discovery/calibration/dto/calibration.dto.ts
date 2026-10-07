import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CalibrationAnswersDto {
  @ApiProperty()
  @IsUUID()
  roundId: string;

  /** Id domanda → valore dell'opzione scelta. */
  @ApiProperty({ type: Object })
  @IsObject()
  answers: Record<string, string>;
}

export class UpdateCalibrationConfigDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  confidenceThreshold?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  levelConfidenceThreshold?: number;

  @ApiPropertyOptional({ minimum: 7, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(90)
  maxDays?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  closingDay?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  questionsPerDriver?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  driversPerRound?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 168 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  minHoursBetweenRounds?: number;
}
