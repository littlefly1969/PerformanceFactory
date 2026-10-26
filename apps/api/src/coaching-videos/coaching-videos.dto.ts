import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { VIDEO_LIMITS } from './coaching-videos';

const URL_RULE = { protocols: ['https'], require_protocol: true };
const URL_MESSAGE = 'Indirizzo del video non valido: usa un link https';

export class CreateCoachingVideoDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(VIDEO_LIMITS.title)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(VIDEO_LIMITS.description)
  description?: string;

  @ApiPropertyOptional({
    description: 'Link https; vuoto finché il file non è pronto',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsUrl(URL_RULE, { message: URL_MESSAGE })
  @MaxLength(VIDEO_LIMITS.url)
  url?: string | null;

  @ApiPropertyOptional({
    description: 'Driver del video; vuoto se vale per tutti',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  areaId?: string | null;
}

export class UpdateCoachingVideoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(VIDEO_LIMITS.title)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(VIDEO_LIMITS.description)
  description?: string;

  @ApiPropertyOptional({
    description: 'Link https; vuoto finché il file non è pronto',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsUrl(URL_RULE, { message: URL_MESSAGE })
  @MaxLength(VIDEO_LIMITS.url)
  url?: string | null;

  @ApiPropertyOptional({
    description: 'Driver del video; vuoto se vale per tutti',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  areaId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
