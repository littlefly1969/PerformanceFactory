import {
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AuthenticatedGuard } from '../../common/guards/authenticated.guard';
import { CARD_NUMBER_MAX, PLAYTOMIC_MAX } from './fit-ranking';
import { FitRankingService } from './fit-ranking.service';

class FitRankingDto {
  @ApiProperty() @IsString() @MaxLength(10) padelCurrent!: string;
  @ApiProperty() @IsString() @MaxLength(10) padelBest!: string;
  @ApiProperty() @IsString() @MaxLength(10) tennisCurrent!: string;
  @ApiProperty() @IsString() @MaxLength(10) tennisBest!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(CARD_NUMBER_MAX)
  cardNumber?: string;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: PLAYTOMIC_MAX,
    description: 'Livello Playtomic di padel, due decimali; null lo toglie',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(PLAYTOMIC_MAX)
  playtomicLevel?: number | null;
}

@ApiTags('athlete-journey')
@ApiCookieAuth()
@Controller('athlete-journey/fit-ranking')
@UseGuards(AuthenticatedGuard)
export class FitRankingController {
  constructor(private readonly rankings: FitRankingService) {}

  @ApiOperation({ summary: 'Classifica FIT dichiarata e liste dei valori' })
  @Get()
  view(@Req() req: { user: { id: string } }) {
    return this.rankings.view(req.user.id);
  }

  @ApiOperation({
    summary:
      'Corregge la classifica FIT; se cambia dopo una valutazione, ricalcola la R',
  })
  @Post()
  update(@Req() req: { user: { id: string } }, @Body() body: FitRankingDto) {
    return this.rankings.update(req.user.id, body);
  }
}
