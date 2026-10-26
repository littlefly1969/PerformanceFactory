import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CLUB_IMAGE_DATA_URL, CLUB_IMAGE_MAX_LENGTH } from '../club-image';

const CODE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const IMAGE_FORMAT = 'Immagine non valida: usa PNG, JPEG o WebP';
const PROVINCE = /^[A-Za-z]{2}$/;
const POSTAL_CODE = /^\d{5}$/;

/**
 * Sede e contatti del circolo, comuni a creazione e modifica. La stringa
 * vuota e il modo di cancellare un dato: salta il controllo di formato e il
 * service la salva come null.
 */
class PartnerDetailsDto {
  @ApiPropertyOptional({ description: 'Sigla della provincia, due lettere' })
  @IsOptional()
  @IsString()
  @ValidateIf((dto: { province?: string }) => dto.province !== '')
  @Matches(PROVINCE, {
    message: 'La provincia usa due lettere (es. CH, AQ, PE, TE)',
  })
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ description: 'CAP di cinque cifre' })
  @IsOptional()
  @IsString()
  @ValidateIf((dto: { postalCode?: string }) => dto.postalCode !== '')
  @Matches(POSTAL_CODE, { message: 'Il CAP usa cinque cifre' })
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Sito ufficiale o pagina social' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ValidateIf((dto: { website?: string }) => dto.website !== '')
  @IsUrl({}, { message: 'Il sito deve essere un indirizzo valido' })
  website?: string;

  @ApiPropertyOptional({ description: 'Il circolo offre la lezione gratuita' })
  @IsOptional()
  @IsBoolean()
  freeLessonsEnabled?: boolean;
}

export class CreatePartnerDto extends PartnerDetailsDto {
  @ApiProperty({ description: 'Codice per link e QR, minuscolo' })
  @IsString()
  @Matches(CODE, {
    message: 'Il codice usa 2-40 caratteri: lettere minuscole, numeri, - e _',
  })
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}

export class UpdatePartnerDto extends PartnerDetailsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Logo come data URL PNG, JPEG o WebP; null lo rimuove',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CLUB_IMAGE_MAX_LENGTH.logo, { message: 'Logo troppo pesante' })
  @Matches(CLUB_IMAGE_DATA_URL, { message: IMAGE_FORMAT })
  logoImage?: string | null;

  @ApiPropertyOptional({
    description: 'Foto come data URL PNG, JPEG o WebP; null la rimuove',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CLUB_IMAGE_MAX_LENGTH.photo, { message: 'Foto troppo pesante' })
  @Matches(CLUB_IMAGE_DATA_URL, { message: IMAGE_FORMAT })
  photoImage?: string | null;
}
