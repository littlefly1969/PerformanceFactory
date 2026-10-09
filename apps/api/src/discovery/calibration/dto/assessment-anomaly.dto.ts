import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ANOMALY_STATUSES } from '../assessment-anomalies';

export class ListAnomaliesQuery {
  @ApiPropertyOptional({ enum: ANOMALY_STATUSES })
  @IsOptional()
  @IsIn(ANOMALY_STATUSES)
  status?: string;
}

export class ReviewAnomalyDto {
  @ApiProperty({ enum: ANOMALY_STATUSES })
  @IsIn(ANOMALY_STATUSES)
  status: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
