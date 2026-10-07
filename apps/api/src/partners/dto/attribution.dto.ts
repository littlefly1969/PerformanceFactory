import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Tracce di provenienza raccolte dal browser prima della registrazione. */
export class AttributionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(36)
  anonymousId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  firstTouch?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  lastTouch?: Record<string, unknown>;
}
