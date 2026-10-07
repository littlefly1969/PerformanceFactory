import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class MarketingConsentDto {
  @ApiProperty()
  @IsBoolean()
  granted: boolean;
}
