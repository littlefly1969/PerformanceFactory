import {
  Body,
  Controller,
  Get,
  HttpCode,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiTags,
  ApiOperation,
  ApiProperty,
} from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CompletePlanItemDto } from '../user-plan/dto/complete-plan-item.dto';
import { AthleteService } from './athlete.service';
class CalendarQuery {
  @ApiProperty({ format: 'date', example: '2026-09-19' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;
  @ApiProperty({ format: 'date', example: '2026-09-19' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}
type Request = { user: { id: string } };
@ApiTags('athlete')
@ApiCookieAuth()
@Controller('athlete')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.USER)
export class AthleteController {
  constructor(private readonly athlete: AthleteService) {}
  @ApiOperation({ summary: 'Home PF4 con azione prioritaria e programma' })
  @Header('Cache-Control', 'private, no-store')
  @Get('home')
  home(@Req() req: Request) {
    return this.athlete.home(req.user.id);
  }
  @ApiOperation({ summary: 'Performance corrente e ultimi 100 snapshot' })
  @Header('Cache-Control', 'private, no-store')
  @Get('progress')
  progress(@Req() req: Request) {
    return this.athlete.progress(req.user.id);
  }
  @ApiOperation({ summary: 'Check-in dovuto dopo le attività del ciclo' })
  @Header('Cache-Control', 'private, no-store')
  @Get('check-in')
  checkIn(@Req() req: Request) {
    return this.athlete.checkIn(req.user.id);
  }
  @ApiOperation({ summary: 'Calendario atleta per un massimo di 93 giorni' })
  @Header('Cache-Control', 'private, no-store')
  @Get('training/calendar')
  calendar(@Req() req: Request, @Query() query: CalendarQuery) {
    return this.athlete.calendar(req.user.id, query.from, query.to);
  }
  @ApiOperation({ summary: 'Dettaglio di una sessione personale' })
  @Header('Cache-Control', 'private, no-store')
  @Get('training/sessions/:id')
  session(@Req() req: Request, @Param('id') id: string) {
    return this.athlete.session(req.user.id, id);
  }
  @ApiOperation({
    summary: 'Completa sessione e contenuto sorgente atomicamente',
  })
  @Post('training/sessions/:id/complete')
  @HttpCode(200)
  complete(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CompletePlanItemDto,
  ) {
    return this.athlete.finish(req.user.id, id, 'COMPLETED', body);
  }
  @ApiOperation({ summary: 'Salta sessione e termina attività del ciclo' })
  @Post('training/sessions/:id/skip')
  @HttpCode(200)
  skip(@Req() req: Request, @Param('id') id: string) {
    return this.athlete.finish(req.user.id, id, 'SKIPPED');
  }
}
