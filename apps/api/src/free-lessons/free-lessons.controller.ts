import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CoachLessonService } from './coach-lesson.service';
import {
  AssignSeatDto,
  CoachFeedbackDto,
  CoachNoShowDto,
  CompleteMicroTestDto,
  CreateFreeLessonDto,
  CreateMicroTestDto,
  RequestFreeLessonDto,
  SetClubFreeLessonsDto,
  SetLessonCoachDto,
  SetMicroTestActiveDto,
  UpdateFreeLessonConfigDto,
} from './dto/free-lesson.dto';
import { FreeLessonAdminService } from './free-lesson-admin.service';
import { updateFreeLessonSettings } from './free-lesson-config';
import { FreeLessonService } from './free-lesson.service';

type AuthRequest = { user: { id: string } };

/** Atleta: obiettivo lezione, crediti, micro-test e richiesta del posto. */
@ApiTags('free-lesson')
@ApiCookieAuth()
@Controller('athlete-journey/free-lesson')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.USER)
export class FreeLessonController {
  constructor(private readonly lessons: FreeLessonService) {}

  @Get()
  @ApiOperation({ summary: 'Lezione gratuita: crediti, fase e micro-test' })
  view(@Req() req: AuthRequest) {
    return this.lessons.view(req.user.id);
  }

  @Post('micro-tests/:id')
  @ApiOperation({ summary: 'Registra l esito di un micro-test' })
  microTest(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteMicroTestDto,
  ) {
    return this.lessons.completeMicroTest(req.user.id, id, body.value);
  }

  @Post('request')
  @ApiOperation({ summary: 'Richiede il posto nella lezione gratuita' })
  request(@Req() req: AuthRequest, @Body() body: RequestFreeLessonDto) {
    return this.lessons.request(
      req.user.id,
      body.partnerId,
      body.shareWithCoach,
    );
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Rinuncia al posto prima della lezione' })
  withdraw(@Req() req: AuthRequest) {
    return this.lessons.withdraw(req.user.id);
  }
}

/** Back office: circoli, lezioni, gruppi, micro-test e parametri dei crediti. */
@ApiTags('admin-free-lessons')
@ApiCookieAuth()
@Controller('admin/free-lessons')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FreeLessonAdminController {
  constructor(
    private readonly admin: FreeLessonAdminService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lezioni, richieste, coach, micro-test e parametri',
  })
  overview() {
    return this.admin.overview();
  }

  @Put('config')
  @ApiOperation({ summary: 'Aggiorna soglia e pesi dei crediti' })
  config(@Req() req: AuthRequest, @Body() body: UpdateFreeLessonConfigDto) {
    return updateFreeLessonSettings(this.prisma, body, req.user.id);
  }

  @Patch('clubs/:id')
  @ApiOperation({
    summary: 'Attiva o spegne la lezione gratuita in un circolo',
  })
  club(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetClubFreeLessonsDto,
  ) {
    return this.admin.setClub(id, body.freeLessonsEnabled);
  }

  @Post('lessons')
  @ApiOperation({ summary: 'Crea una lezione in un circolo' })
  createLesson(@Req() req: AuthRequest, @Body() body: CreateFreeLessonDto) {
    return this.admin.createLesson(body, req.user.id);
  }

  @Patch('lessons/:id/coach')
  @ApiOperation({ summary: 'Assegna o toglie il coach della lezione' })
  coach(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetLessonCoachDto,
  ) {
    return this.admin.setCoach(id, body.coachId ?? null);
  }

  @Post('lessons/:id/cancel')
  @ApiOperation({ summary: 'Annulla la lezione: i posti tornano richieste' })
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    await this.admin.cancel(id);
    return this.admin.overview();
  }

  @Post('lessons/:id/seats')
  @ApiOperation({ summary: 'Assegna un posto a un atleta che l ha richiesto' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignSeatDto,
  ) {
    await this.admin.assign(id, body.userId);
    return this.admin.overview();
  }

  @Delete('lessons/:id/seats/:userId')
  @ApiOperation({ summary: 'Toglie un atleta dal gruppo' })
  async unassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.admin.unassign(id, userId);
    return this.admin.overview();
  }

  @Post('micro-tests')
  @ApiOperation({ summary: 'Aggiunge un micro-test al catalogo' })
  createMicroTest(@Body() body: CreateMicroTestDto) {
    return this.admin.createMicroTest(body);
  }

  @Patch('micro-tests/:id')
  @ApiOperation({ summary: 'Attiva o disattiva un micro-test' })
  microTest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetMicroTestActiveDto,
  ) {
    return this.admin.setMicroTestActive(id, body.isActive);
  }
}

/** Coach del circolo: le sue lezioni, presenze e feedback. */
@ApiTags('professional-lessons')
@ApiCookieAuth()
@Controller('professional/lessons')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.PROFESSIONAL)
export class CoachLessonController {
  constructor(private readonly coach: CoachLessonService) {}

  @Get()
  @ApiOperation({ summary: 'Lezioni gratuite del coach con i partecipanti' })
  lessons(@Req() req: AuthRequest) {
    return this.coach.lessons(req.user.id);
  }

  @Post(':id/feedback')
  @ApiOperation({ summary: 'Feedback del coach per un atleta della lezione' })
  feedback(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CoachFeedbackDto,
  ) {
    return this.coach.submitFeedback(req.user.id, id, body);
  }

  @Post(':id/no-show')
  @ApiOperation({ summary: 'Segna un atleta assente' })
  async noShow(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CoachNoShowDto,
  ) {
    await this.coach.markNoShow(req.user.id, id, body.userId);
    return { ok: true };
  }
}
