import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class AssessmentOptionDto {
  @ApiProperty({ description: 'Valore salvato come risposta' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  value: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  label: string;

  @ApiProperty({ description: 'Punteggio 0-100 che alimenta il driver' })
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;
}

export class CreateAssessmentTemplateDto {
  @ApiProperty({ description: 'Driver di appartenenza, non modificabile' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  areaId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  label: string;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(2000)
  helpText?: string | null;

  @ApiProperty({ type: [AssessmentOptionDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AssessmentOptionDto)
  options: AssessmentOptionDto[];

  @ApiPropertyOptional({ description: 'Predefinito: attiva' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAssessmentTemplateDto extends PartialType(
  OmitType(CreateAssessmentTemplateDto, ['areaId'] as const),
) {}

export class ReorderAssessmentTemplatesDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  areaId: string;

  @ApiProperty({
    type: [String],
    description: 'Tutte le domande del driver nel nuovo ordine',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids: string[];
}
