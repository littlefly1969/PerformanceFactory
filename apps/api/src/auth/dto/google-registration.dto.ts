import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ConsentAcceptanceDto } from '../../consents/dto/consent-acceptance.dto';
import { AttributionDto } from '../../partners/dto/attribution.dto';
export class GoogleRegistrationDto extends ConsentAcceptanceDto {
  @IsObject() discovery!: Record<string, unknown>;

  @ApiProperty({
    description: 'Dichiarazione di avere almeno 18 anni (MVP solo 18+)',
  })
  @IsBoolean()
  adultConfirmed!: boolean;

  @ApiPropertyOptional({
    description: 'Token della bozza server del quiz, da collegare all’account',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  quizToken?: string;

  @ApiPropertyOptional({ type: AttributionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttributionDto)
  attribution?: AttributionDto;
}
