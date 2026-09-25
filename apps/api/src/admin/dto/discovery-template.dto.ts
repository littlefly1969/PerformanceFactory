import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { OnboardingInputType } from '@prisma/client';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateDiscoveryTemplateDto {
  @ApiProperty({
    description: 'Codice stabile, referenziato dalle condizioni',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  key: string;

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

  @ApiProperty({ enum: OnboardingInputType })
  @IsEnum(OnboardingInputType)
  inputType: OnboardingInputType;

  @ApiProperty({
    description:
      'Metadati discovery: type, options, min, max, step, ui, contextKey, visibleWhen, target',
  })
  @Allow()
  optionsJson: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description: 'Posizione; se assente la domanda va in fondo',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  orderIndex?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDiscoveryTemplateDto extends PartialType(
  OmitType(CreateDiscoveryTemplateDto, ['key'] as const),
) {}

export class ReorderOnboardingTemplatesDto {
  @ApiProperty({
    type: [String],
    description: 'Tutti gli ID discovery nel nuovo ordine',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids: string[];
}
