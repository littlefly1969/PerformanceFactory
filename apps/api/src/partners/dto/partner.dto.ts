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

const CODE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const PROVINCE = /^[A-Za-z]{2}$/;
const POSTAL_CODE = /^\d{5}$/;

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

  @ApiPropertyOptional({ description: 'Sigla della provincia, due lettere' })
  @IsOptional()
  @IsString()
  // Stringa vuota ammessa: il service la trasforma in null per svuotare il campo.
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

  @ApiPropertyOptional({ description: 'URL pubblico del logo' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ValidateIf((dto: { logoUrl?: string }) => dto.logoUrl !== '')
  @IsUrl({}, { message: 'Il logo deve essere un indirizzo valido' })
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Il circolo offre la lezione gratuita' })
  @IsOptional()
  @IsBoolean()
  freeLessonsEnabled?: boolean;
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

  @ApiPropertyOptional({ description: 'Sigla della provincia, due lettere' })
  @IsOptional()
  @IsString()
  // Stringa vuota ammessa: il service la trasforma in null per svuotare il campo.
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

  @ApiPropertyOptional({ description: 'URL pubblico del logo' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ValidateIf((dto: { logoUrl?: string }) => dto.logoUrl !== '')
  @IsUrl({}, { message: 'Il logo deve essere un indirizzo valido' })
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Il circolo offre la lezione gratuita' })
  @IsOptional()
  @IsBoolean()
  freeLessonsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
