import { ApiPropertyOptional } from '@nestjs/swagger';

export class AreaApprovalDto {
  @ApiPropertyOptional()
  notes?: string;
}
