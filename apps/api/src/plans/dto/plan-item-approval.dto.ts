import { ApiPropertyOptional } from '@nestjs/swagger';

export class PlanItemApprovalDto {
  @ApiPropertyOptional()
  reason?: string;
}
