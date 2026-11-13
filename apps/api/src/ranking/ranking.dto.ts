import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';
import { RANKING_BANDS } from './ranking-rules';

export class RankingVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  granted!: boolean;
}

export class RankingAnnouncementDto {
  @ApiProperty({ enum: RANKING_BANDS })
  @IsIn(RANKING_BANDS)
  band!: string;
}

export class RankingConfigDto {
  @ApiProperty({ minimum: 0, maximum: 100, example: 60 })
  @IsInt()
  @Min(0)
  @Max(100)
  realWeight!: number;

  @ApiProperty({ minimum: 0, maximum: 100, example: 40 })
  @IsInt()
  @Min(0)
  @Max(100)
  potentialWeight!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 80 })
  @IsInt()
  @Min(1)
  @Max(100)
  pf1Min!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 66 })
  @IsInt()
  @Min(1)
  @Max(100)
  pf2Min!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 50 })
  @IsInt()
  @Min(1)
  @Max(100)
  pf3Min!: number;
}
