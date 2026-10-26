import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CLUB_IMAGE_DATA_URL, CLUB_IMAGE_MAX_LENGTH } from '../club-image';

const CODE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const IMAGE_FORMAT = 'Immagine non valida: usa PNG, JPEG o WebP';

export class CreatePartnerDto {
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

export class UpdatePartnerDto {
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
