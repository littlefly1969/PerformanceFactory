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
}
