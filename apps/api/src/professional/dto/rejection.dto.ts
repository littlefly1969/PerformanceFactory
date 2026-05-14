import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  approvalId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  rejectionReason: string;
}
