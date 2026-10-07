import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AcceptedDocumentDto } from '../../consents/dto/consent-acceptance.dto';
import { AttributionDto } from '../../partners/dto/attribution.dto';

export class RegisterAthleteDto {
  @ApiProperty({ type: Object })
  @IsObject()
  discovery: Record<string, unknown>;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @ApiProperty({
    description: 'Dichiarazione di avere almeno 18 anni (MVP solo 18+)',
  })
  @IsBoolean()
  adultConfirmed: boolean;

  @ApiProperty({ required: false, type: AttributionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttributionDto)
  attribution?: AttributionDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  privacyAccepted?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  aiAssistantAccepted?: boolean;

  @ApiProperty({ required: false, type: [AcceptedDocumentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptedDocumentDto)
  acceptedDocuments?: AcceptedDocumentDto[];
}
