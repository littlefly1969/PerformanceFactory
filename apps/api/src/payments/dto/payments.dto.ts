import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingCycle, ProgramHorizon } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class StartCheckoutDto {
  @ApiProperty({ enum: ProgramHorizon })
  @IsEnum(ProgramHorizon)
  horizon!: ProgramHorizon;

  @ApiProperty({ enum: BillingCycle })
  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;
}

export class UpdateBillingPriceDto {
  @ApiProperty({ description: 'Importo in centesimi, es. 1990 = 19,90' })
  @IsInt()
  @Min(50)
  @Max(1_000_000)
  amountCents!: number;

  @ApiPropertyOptional({ example: 'eur' })
  @IsOptional()
  @Matches(/^[a-zA-Z]{3}$/)
  currency?: string;
}

export class UpdateBillingOptionDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
