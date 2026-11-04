import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  AddressResolveDto,
  AddressSuggestionsDto,
} from '../../athlete/athlete-address';

export class RequestFreeLessonDto {
  @ApiProperty()
  @IsUUID()
  partnerId: string;

  /**
   * Deprecato e ignorato: il coach della lezione vede nome, livello e driver
   * per il consenso privacy accettato alla registrazione. Resta accettato per
   * i client non ancora aggiornati.
   */
  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Ignorato: la condivisione con il coach è coperta dal consenso privacy della registrazione',
  })
  @IsOptional()
  @IsBoolean()
  shareWithCoach?: boolean;

  /** Lezione in calendario preferita; il gruppo lo compone comunque l'admin. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  lessonId?: string;
}

/**
 * CAP o città scritti dall'atleta per cercare i circoli: lo stesso token di
 * sessione dei suggerimenti dell'indirizzo, testo più corto.
 */
export class AreaSuggestionsDto extends PickType(AddressSuggestionsDto, [
  'sessionToken',
] as const) {
  @ApiProperty({ description: 'CAP o città, almeno 2 caratteri' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  input!: string;
}

/** Scelta di un CAP o di una città fra i suggerimenti di Google. */
export class AreaResolveDto extends AddressResolveDto {}

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
