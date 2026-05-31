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
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from '../admin/admin.service';
import { UpsertAiAreaGenerationConfigDto } from '../admin/dto/upsert-ai-area-generation-config.dto';
import { UpsertGoalPromptConfigDto } from '../admin/dto/upsert-goal-prompt-config.dto';
import { UpsertOnboardingTemplateDto } from '../admin/dto/upsert-onboarding-template.dto';
import { AiTuningService } from './ai-tuning.service';
import { RunReplayDto } from './dto/run-replay.dto';
import { SaveReplayFeedbackDto } from './dto/save-replay-feedback.dto';
import { UpsertGoldenContextDto } from './dto/upsert-golden-context.dto';
import { CreateEvaluationRunDto } from './dto/create-evaluation-run.dto';
import { RateEvaluationResultDto } from './dto/rate-evaluation-result.dto';
import { TestPromptDto } from './dto/test-prompt.dto';

type ActorRequest = { user?: { id: string; role: UserRole } };
type DownloadReply = {
  header?: (name: string, value: string) => unknown;
  setHeader?: (name: string, value: string) => unknown;
};

@ApiTags('ai-tuning')
@Controller('ai-tuning')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.AI_TUNER, UserRole.ADMIN)
@ApiCookieAuth()
export class AiTuningController {
  constructor(
    private readonly tuning: AiTuningService,
    private readonly promptAdmin: AdminService,
  ) {}

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

  @Get('prompt-settings')
  @ApiOperation({ summary: 'Configurazione prompt e onboarding' })
  @Roles(UserRole.AI_TUNER)
  getPromptSettings() {
    return this.promptAdmin.getAiSettings();
  }

  @Get('prompt-versions')
  @ApiOperation({ summary: 'Storico immutabile versioni prompt' })
  @Roles(UserRole.AI_TUNER)
  listPromptVersions(
    @Query('type') type?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.tuning.listPromptVersions({ type, ownerId });
  }

  @Get('active-prompts/export')
  @ApiOperation({ summary: 'Esporta prompt AI attivi in formato testo' })
  @ApiProduces('text/plain')
  @Roles(UserRole.AI_TUNER, UserRole.ADMIN)
  async exportActivePrompts(@Res({ passthrough: true }) reply: DownloadReply) {
    const exportFile = await this.tuning.exportActivePrompts();
    const encodedFilename = encodeURIComponent(exportFile.filename);
    const contentDisposition = [
      `attachment; filename="${exportFile.filename}"`,
      `filename*=UTF-8''${encodedFilename}`,
    ].join('; ');
    const contentLength = Buffer.byteLength(
      exportFile.content,
      'utf8',
    ).toString();
    reply.header?.('Content-Type', 'text/plain; charset=utf-8');
    reply.header?.('Content-Disposition', contentDisposition);
    reply.header?.('Content-Length', contentLength);
    reply.setHeader?.('Content-Type', 'text/plain; charset=utf-8');
    reply.setHeader?.('Content-Disposition', contentDisposition);
    reply.setHeader?.('Content-Length', contentLength);
    return exportFile.content;
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

  @Post('prompt-test')
  @ApiOperation({ summary: 'Testa un prompt libero con il provider AI' })
  @Roles(UserRole.AI_TUNER)
  testPrompt(@Body() dto: TestPromptDto) {
    return this.tuning.testPrompt(dto);
  }

  @Post('goal-prompt')
  @ApiOperation({ summary: 'Crea o aggiorna il prompt obiettivo atleta' })
  @Roles(UserRole.AI_TUNER)
  upsertGoalPrompt(
    @Req() req: ActorRequest,
    @Body() body: UpsertGoalPromptConfigDto,
  ) {
    return this.promptAdmin.upsertGoalPromptConfig(body, req.user?.id ?? '');
  }

  @Post('sports')
  @ApiOperation({
    summary: 'Crea o aggiorna sport, specializzazioni e prompt area',
  })
  @Roles(UserRole.AI_TUNER)
  upsertSport(
    @Req() req: ActorRequest,
    @Body()
    body: {
      id?: string;
      key?: string;
      label?: string;
      isActive?: boolean;
      specializations?: Array<{
        id?: string;
        key?: string;
        label?: string;
        trainingPrompt?: string;
        trainingPromptActive?: boolean;
        isActive?: boolean;
        prompts?: Array<{
          id?: string;
          areaId?: string;
          basePrompt?: string;
          isEnabledDriver?: boolean;
          isActive?: boolean;
        }>;
      }>;
    },
  ) {
    return this.promptAdmin.upsertSportCatalog(body, req.user?.id ?? '');
  }

  @Delete('sports/:sportId')
  @ApiOperation({
    summary: 'Cancella uno sport e le specializzazioni collegate',
  })
  @Roles(UserRole.AI_TUNER)
  deleteSport(@Param('sportId') sportId: string) {
    return this.promptAdmin.deleteSport(sportId);
  }

  @Post('ai-area-configs')
  @ApiOperation({
    summary: 'Crea o aggiorna una configurazione generazione AI per area',
  })
  @Roles(UserRole.AI_TUNER)
  upsertAiAreaConfig(
    @Req() req: ActorRequest,
    @Body() body: UpsertAiAreaGenerationConfigDto,
  ) {
    return this.promptAdmin.upsertAiAreaGenerationConfig(
      body,
      req.user?.id ?? '',
    );
  }

  @Post('onboarding-templates')
  @ApiOperation({ summary: 'Crea o aggiorna un template domanda onboarding' })
  @Roles(UserRole.AI_TUNER)
  upsertOnboardingTemplate(
    @Req() req: ActorRequest,
    @Body() body: UpsertOnboardingTemplateDto,
  ) {
    return this.promptAdmin.upsertOnboardingTemplate(body, req.user?.id ?? '');
  }

  @Delete('onboarding-templates/:id')
  @ApiOperation({ summary: 'Elimina un template domanda onboarding' })
  @Roles(UserRole.AI_TUNER)
  deleteOnboardingTemplate(@Param('id') id: string) {
    return this.promptAdmin.deleteOnboardingTemplate(id);
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
