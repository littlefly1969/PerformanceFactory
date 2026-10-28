import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
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

  /** Id domanda → valore dell'opzione scelta, o elenco se la domanda è multipla. */
  @ApiProperty({ type: Object })
  @IsObject()
  answers: Record<string, string | string[]>;
}

export class SituationAnswerDto {
  @ApiProperty()
  @IsUUID()
  roundId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  questionId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  value: string;
}

export class CalibrationRoundDto {
  @ApiProperty()
  @IsUUID()
  roundId: string;
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

  /** Una micro-prova ogni N domande, come indicazione al motore; 0 = nessuna. */
  @ApiPropertyOptional({ minimum: 0, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  questionsPerMicroTest?: number;

  /** Domande conoscitive iniziali per driver, scritte dall'AI. */
  @ApiPropertyOptional({ minimum: 1, maximum: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  initialQuestionsPerArea?: number;

  /** Parole o frasi vietate nei micro-test generati dall'AI. */
  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  unsafeMicroTestTerms?: string[];

  /** Parole o frasi vietate negli allenamenti generati dall'AI; vuota = nessun controllo. */
  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  unsafeTrainingTerms?: string[];
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
