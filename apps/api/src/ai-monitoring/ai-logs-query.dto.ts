import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AI_OPERATIONS } from './ai-monitoring.service';

export class AiLogsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days = 7;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
  @Type(() => Number)
  @IsInt()
  @IsIn([25, 50, 100])
  pageSize = 25;
  @IsOptional()
  @IsIn(['SUCCESS', 'ERROR', 'RUNNING', 'INTERRUPTED'])
  status?: string;
  @IsOptional()
  @IsIn(['openai', 'gemini', 'stub'])
  provider?: string;
  @IsOptional()
  @IsIn(AI_OPERATIONS)
  operation?: string;
  @IsOptional()
  @IsUUID()
  id?: string;
}
