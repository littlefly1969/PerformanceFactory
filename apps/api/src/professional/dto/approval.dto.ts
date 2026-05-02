import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApprovalDto {
  @ApiPropertyOptional()
  approvalId?: string;
}
