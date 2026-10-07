import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_EVENTS_PER_REQUEST } from '../analytics-events';

export class ClientEventDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  name: string;

  @ApiProperty({ description: 'UUID dell evento, per non contarlo due volte' })
  @IsString()
  @MaxLength(36)
  eventId: string;

  @ApiPropertyOptional({ description: 'ISO 8601, ora del dispositivo' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  occurredAt?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

export class TrackEventsDto {
  @ApiProperty({ description: 'UUID anonimo generato dal browser' })
  @IsString()
  @MaxLength(36)
  anonymousId: string;

  @ApiProperty({ type: [ClientEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EVENTS_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => ClientEventDto)
  events: ClientEventDto[];
}
