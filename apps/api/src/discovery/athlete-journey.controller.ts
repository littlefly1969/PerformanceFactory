import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, Allow } from 'class-validator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { AthleteJourneyService } from './athlete-journey.service';
import { SelectHorizonDto } from './scenarios/select-horizon.dto';
import {
  CalibrationAnswersDto,
  CalibrationRoundDto,
} from './calibration/dto/calibration.dto';
class AnswerDto {
  @ApiProperty() @IsString() @MaxLength(100) questionId!: string;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'number' }] })
  @Allow()
  value!: unknown;
}
class SubmitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goal?: string;
}
class DurationDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() weeks?: number;
}
@ApiTags('athlete-journey')
@ApiCookieAuth()
@Controller('athlete-journey')
@UseGuards(AuthenticatedGuard)
export class AthleteJourneyController {
  constructor(private readonly journey: AthleteJourneyService) {}
  @ApiOperation({ summary: 'Stato del percorso PF4' })
  @Get()
  state(@Req() req: { user: { id: string } }) {
    return this.journey.state(req.user.id);
  }
  @ApiOperation({ summary: 'Prepara assessment specialistico' })
  @Post('start')
  start(@Req() req: { user: { id: string } }) {
    return this.journey.start(req.user.id);
  }
  @ApiOperation({ summary: 'Salva risposta e avanzamento' })
  @Post('answer')
  answer(@Req() req: { user: { id: string } }, @Body() body: AnswerDto) {
    return this.journey.answer(req.user.id, body.questionId, body.value);
  }
  @ApiOperation({ summary: 'Torna alla domanda precedente' })
  @Post('back')
  back(@Req() req: { user: { id: string } }) {
    return this.journey.back(req.user.id);
  }
  @ApiOperation({
    summary: 'Valuta le risposte con l AI e salva la R provvisoria per driver',
  })
  @Post('evaluate')
  evaluate(@Req() req: { user: { id: string } }) {
    return this.journey.evaluate(req.user.id);
  }
  @ApiOperation({ summary: 'Valida obiettivo e crea baseline' })
  @Post('submit')
  submit(@Req() req: { user: { id: string } }, @Body() body: SubmitDto) {
    return this.journey.submit(req.user.id, body.goal);
  }
  @ApiOperation({ summary: 'Seleziona durata programma' })
  @Post('duration')
  duration(@Req() req: { user: { id: string } }, @Body() body: DurationDto) {
    return this.journey.duration(req.user.id, body.weeks);
  }
  @ApiOperation({
    summary:
      'Apre il prossimo round di calibrazione con domande AI sui driver meno affidabili',
  })
  @Post('calibration/round')
  calibrationRound(@Req() req: { user: { id: string } }) {
    return this.journey.calibrationRound(req.user.id);
  }
  @ApiOperation({
    summary: 'Risponde al round di calibrazione e aggiorna R e confidence',
  })
  @Post('calibration/answers')
  calibrationAnswers(
    @Req() req: { user: { id: string } },
    @Body() body: CalibrationAnswersDto,
  ) {
    return this.journey.calibrationAnswers(
      req.user.id,
      body.roundId,
      body.answers,
    );
  }
  @ApiOperation({
    summary:
      'Salta il micro-test proposto: nessun esito, il motore sceglie un altro passo',
  })
  @Post('calibration/skip')
  calibrationSkip(
    @Req() req: { user: { id: string } },
    @Body() body: CalibrationRoundDto,
  ) {
    return this.journey.calibrationSkip(req.user.id, body.roundId);
  }
  @ApiOperation({
    summary: 'Sceglie il percorso di 3, 6 o 12 mesi dopo gli scenari P3/P6/P12',
  })
  @Post('horizon')
  horizon(
    @Req() req: { user: { id: string } },
    @Body() body: SelectHorizonDto,
  ) {
    return this.journey.horizon(req.user.id, body.horizon);
  }
  @ApiOperation({
    summary:
      'Registra la prima apertura del paywall, dopo il reveal e la scelta del percorso',
  })
  @Post('paywall/viewed')
  paywallViewed(@Req() req: { user: { id: string } }) {
    return this.journey.paywallViewed(req.user.id);
  }
}
