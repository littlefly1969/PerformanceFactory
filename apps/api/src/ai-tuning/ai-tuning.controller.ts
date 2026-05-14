import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AiTuningService } from './ai-tuning.service';
import { RunReplayDto } from './dto/run-replay.dto';
import { SaveReplayFeedbackDto } from './dto/save-replay-feedback.dto';
import { UpsertGoldenContextDto } from './dto/upsert-golden-context.dto';
import { CreateEvaluationRunDto } from './dto/create-evaluation-run.dto';
import { RateEvaluationResultDto } from './dto/rate-evaluation-result.dto';

type ActorRequest = { user?: { id: string; role: UserRole } };

@ApiTags('ai-tuning')
@Controller('ai-tuning')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.AI_TUNER, UserRole.ADMIN)
@ApiCookieAuth()
export class AiTuningController {
  constructor(private readonly tuning: AiTuningService) {}

  @Get('areas')
  @ApiOperation({ summary: 'Elenco aree per filtraggio' })
  getAreas() {
    return this.tuning.listAreas();
  }

  @Get('area-configs')
  @ApiOperation({ summary: 'Configurazioni AI per area' })
  getAreaConfigs() {
    return this.tuning.listAreaConfigs();
  }

  @Get('audits')
  @ApiOperation({ summary: 'Lista audit AI pseudonimizzati' })
  getAudits(
    @Query('areaId') areaId?: string,
    @Query('provider') provider?: string,
    @Query('page') page?: string,
  ) {
    return this.tuning.listAudits({
      areaId,
      provider,
      page: page ? Number.parseInt(page, 10) : 1,
    });
  }

  @Get('audits/:id')
  @ApiOperation({ summary: 'Dettaglio audit AI' })
  getAuditDetail(@Param('id') id: string) {
    return this.tuning.getAuditDetail(id);
  }

  @Post('replays')
  @ApiOperation({ summary: 'Esegui replay sincronizzato' })
  runReplay(@Req() req: ActorRequest, @Body() dto: RunReplayDto) {
    return this.tuning.runReplay(req.user?.id ?? '', dto);
  }

  @Get('replays')
  @ApiOperation({ summary: 'Lista replay utente corrente' })
  listReplays(@Req() req: ActorRequest, @Query('page') page?: string) {
    return this.tuning.listReplays(
      req.user?.id ?? '',
      page ? Number.parseInt(page, 10) : 1,
    );
  }

  @Get('replays/:id')
  @ApiOperation({ summary: 'Dettaglio replay' })
  getReplay(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.tuning.getReplay(req.user?.id ?? '', id);
  }

  @Post('replays/:id/feedback')
  @ApiOperation({ summary: 'Salva valutazione rubric su un replay' })
  saveFeedback(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Body() dto: SaveReplayFeedbackDto,
  ) {
    return this.tuning.saveReplayFeedback(req.user?.id ?? '', id, dto);
  }

  @Get('golden-contexts')
  @ApiOperation({ summary: 'Lista golden context' })
  listGoldens(@Query('areaId') areaId?: string) {
    return this.tuning.listGoldenContexts(areaId);
  }

  @Post('golden-contexts')
  @ApiOperation({ summary: 'Crea golden context' })
  createGolden(@Req() req: ActorRequest, @Body() dto: UpsertGoldenContextDto) {
    return this.tuning.createGoldenContext(req.user?.id ?? '', dto);
  }

  @Patch('golden-contexts/:id')
  @ApiOperation({ summary: 'Modifica golden context' })
  updateGolden(@Param('id') id: string, @Body() dto: UpsertGoldenContextDto) {
    return this.tuning.updateGoldenContext(id, dto);
  }

  @Delete('golden-contexts/:id')
  @ApiOperation({ summary: 'Elimina golden context' })
  deleteGolden(@Param('id') id: string) {
    return this.tuning.deleteGoldenContext(id);
  }

  @Post('golden-contexts/from-audit/:auditId')
  @ApiOperation({ summary: 'Crea golden a partire da audit reale' })
  createFromAudit(
    @Req() req: ActorRequest,
    @Param('auditId') auditId: string,
    @Body() body: { label: string },
  ) {
    return this.tuning.createGoldenContextFromAudit(
      req.user?.id ?? '',
      auditId,
      body.label,
    );
  }

  @Get('evaluations')
  @ApiOperation({ summary: 'Lista evaluation run' })
  listEvalRuns() {
    return this.tuning.listEvaluationRuns();
  }

  @Get('evaluations/:id')
  @ApiOperation({ summary: 'Dettaglio evaluation run con risultati' })
  getEvalRun(@Param('id') id: string) {
    return this.tuning.getEvaluationRun(id);
  }

  @Post('evaluations')
  @ApiOperation({ summary: 'Crea ed esegui evaluation run (async)' })
  createEvalRun(@Req() req: ActorRequest, @Body() dto: CreateEvaluationRunDto) {
    return this.tuning.createEvaluationRun(req.user?.id ?? '', dto);
  }

  @Post('evaluations/:runId/results/:resultId/rate')
  @ApiOperation({ summary: 'Salva rubric su singolo risultato evaluation' })
  rateEvalResult(
    @Req() req: ActorRequest,
    @Param('resultId') resultId: string,
    @Body() dto: RateEvaluationResultDto,
  ) {
    return this.tuning.rateEvaluationResult(req.user?.id ?? '', resultId, dto);
  }

  @Get('cost')
  @ApiOperation({ summary: 'Sintesi costi token AI' })
  getCost(@Query('from') from?: string, @Query('to') to?: string) {
    return this.tuning.getCostSummary({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
