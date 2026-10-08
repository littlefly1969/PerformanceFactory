import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { POLICY_KINDS } from '../confidence-policy';

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
  levelConfidenceThreshold?: number;

  @ApiPropertyOptional({ minimum: 7, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(90)
  maxDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  programBeforePaywall?: boolean;
}

/** Nuova versione di una regola di confidence; null = criterio non applicato. */
export class PublishConfidencePolicyDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  minOverallConfidence: number | null = null;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  minAreaConfidence: number | null = null;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  minAreasAtConfidence: number | null = null;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ConfidencePolicyKindParam {
  @ApiProperty({ enum: POLICY_KINDS })
  @IsIn(POLICY_KINDS)
  kind: string;
}
