import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RejectionDto {
  @ApiPropertyOptional()
  approvalId?: string;

  @ApiProperty()
  rejectionReason: string;
}
