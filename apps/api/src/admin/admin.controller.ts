import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OrchestratorService } from '../ai-orchestrator/orchestrator.service';
import { ConsentsService } from '../consents/consents.service';
import { RunCycleDto } from './dto/run-cycle.dto';
import { AdminService } from './admin.service';
import { UpsertAiAreaGenerationConfigDto } from './dto/upsert-ai-area-generation-config.dto';
import { UpsertOnboardingTemplateDto } from './dto/upsert-onboarding-template.dto';
import { UpsertGoalPromptConfigDto } from './dto/upsert-goal-prompt-config.dto';

@ApiTags('admin-cycles')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly admin: AdminService,
    private readonly consents: ConsentsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Cruscotto operativo amministratore' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  dashboard() {
    return this.admin.getDashboard();
  }

  @Post('orchestrator/run')
  @ApiOperation({ summary: 'Esegui ciclo proposta (solo amministratore)' })
  @ApiBody({ type: RunCycleDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  // NOTE: SYSTEM access is out of scope; only ADMIN is allowed for this task.
  @Roles(UserRole.ADMIN)
  run(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Body() body: RunCycleDto,
  ) {
    return this.orchestrator.runProposalBatch(
      body.userIds,
      req.user?.id ?? '',
      body.areaId,
      body.runAllAreas ?? true,
    );
  }

  @Post('orchestrator/preview')
  @ApiOperation({ summary: 'Anteprima contesto proposta AI prima della generazione' })
  @ApiBody({ type: RunCycleDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  preview(@Body() body: RunCycleDto) {
    const userId = body.userIds?.[0];
    if (!userId || !body.areaId || body.runAllAreas) {
      throw new BadRequestException(
        'L anteprima richiede un utente e un area target',
      );
    }
    return this.orchestrator.previewCycleProposalInput(userId, body.areaId);
  }

  @Post('orchestrator/training/run')
  @ApiOperation({ summary: 'Genera allenamento autonomo sport-specializzazione' })
  @ApiBody({ type: RunCycleDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  runTraining(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Body() body: RunCycleDto,
  ) {
    return this.orchestrator.runTrainingPlanBatch(
      body.userIds,
      req.user?.id ?? '',
    );
  }

  @Post('orchestrator/training/preview')
  @ApiOperation({ summary: 'Anteprima contesto allenamento autonomo AI' })
  @ApiBody({ type: RunCycleDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  previewTraining(@Body() body: RunCycleDto) {
    const userId = body.userIds?.[0];
    if (!userId) {
      throw new BadRequestException('L anteprima richiede un utente');
    }
    return this.orchestrator.previewTrainingProposalInput(userId);
  }

  @Patch('users/:userId/activate')
  @ApiOperation({ summary: 'Abilita account atleta in attesa' })
  @ApiParam({ name: 'userId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  activateUser(@Param('userId') userId: string) {
    return this.admin.setUserActive(userId, true);
  }

  @Patch('users/:userId/deactivate')
  @ApiOperation({ summary: 'Disabilita account atleta' })
  @ApiParam({ name: 'userId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deactivateUser(@Param('userId') userId: string) {
    return this.admin.setUserActive(userId, false);
  }

  @Patch('users/:userId/reject')
  @ApiOperation({ summary: 'Rifiuta candidatura atleta in attesa' })
  @ApiParam({ name: 'userId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  rejectUser(@Param('userId') userId: string) {
    return this.admin.rejectUserApplication(userId);
  }

  @Post('users/:userId/reset-data')
  @ApiOperation({
    summary: 'Cancella dati operativi atleta e riporta onboarding a inizio',
  })
  @ApiParam({ name: 'userId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  resetUserData(@Param('userId') userId: string) {
    return this.admin.resetUserOperationalData(userId);
  }

  @Get('ai-settings')
  @ApiOperation({ summary: 'Configurazione prompt AI e onboarding amministratore' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  aiSettings() {
    return this.admin.getAiSettings();
  }

  @Get('consent-documents')
  @ApiOperation({ summary: 'Documenti consenso correnti' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  consentDocuments() {
    return this.consents.requiredDocuments();
  }

  @Post('consent-documents')
  @ApiOperation({ summary: 'Pubblica una nuova versione di documento consenso' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertConsentDocument(
    @Req() req: { user?: { id: string } },
    @Body()
    body: {
      type?: string;
      version?: string;
      title?: string;
      summary?: string;
      body?: string[];
      publish?: boolean;
    },
  ) {
    return this.consents.upsertDocument(body, req.user?.id ?? '');
  }

  @Post('goal-prompt')
  @ApiOperation({ summary: 'Crea o aggiorna il prompt AI obiettivo atleta' })
  @ApiBody({ type: UpsertGoalPromptConfigDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertGoalPrompt(
    @Req() req: { user?: { id: string } },
    @Body() body: UpsertGoalPromptConfigDto,
  ) {
    return this.admin.upsertGoalPromptConfig(body, req.user?.id ?? '');
  }

  @Post('sports')
  @ApiOperation({ summary: 'Crea o aggiorna sport, specializzazioni e prompt area' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertSport(
    @Req() req: { user?: { id: string } },
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
    return this.admin.upsertSportCatalog(body, req.user?.id ?? '');
  }

  @Delete('sports/:sportId')
  @ApiOperation({ summary: 'Cancella uno sport e le specializzazioni collegate' })
  @ApiParam({ name: 'sportId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteSport(@Param('sportId') sportId: string) {
    return this.admin.deleteSport(sportId);
  }

  @Post('ai-area-configs')
  @ApiOperation({
    summary: 'Crea o aggiorna una configurazione generazione AI per area',
  })
  @ApiBody({ type: UpsertAiAreaGenerationConfigDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertAiAreaConfig(
    @Req() req: { user?: { id: string } },
    @Body() body: UpsertAiAreaGenerationConfigDto,
  ) {
    return this.admin.upsertAiAreaGenerationConfig(body, req.user?.id ?? '');
  }

  @Post('onboarding-templates')
  @ApiOperation({ summary: 'Crea o aggiorna un template domanda onboarding' })
  @ApiBody({ type: UpsertOnboardingTemplateDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertOnboardingTemplate(
    @Req() req: { user?: { id: string } },
    @Body() body: UpsertOnboardingTemplateDto,
  ) {
    return this.admin.upsertOnboardingTemplate(body, req.user?.id ?? '');
  }

  @Post('maintenance/close-answered-questionnaires')
  @ApiOperation({
    summary: 'Chiudi i questionari pubblicati che hanno gia tutte le risposte',
  })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  closeAnsweredQuestionnaires() {
    return this.admin.closeAnsweredQuestionnaires();
  }

  @Post('cycles/:cycleId/publish')
  @ApiOperation({ summary: 'Pubblica un ciclo (solo amministratore)' })
  @ApiParam({ name: 'cycleId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  // NOTE: SYSTEM access is out of scope; only ADMIN is allowed for this task.
  @Roles(UserRole.ADMIN)
  publish(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('cycleId') cycleId: string,
  ) {
    return this.orchestrator.publishCycle(cycleId, req.user?.id ?? '');
  }

  @Post('training-plans/:trainingPlanId/publish')
  @ApiOperation({ summary: 'Pubblica un allenamento approvato dall allenatore' })
  @ApiParam({ name: 'trainingPlanId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  publishTrainingPlan(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('trainingPlanId') trainingPlanId: string,
  ) {
    return this.orchestrator.publishTrainingPlan(
      trainingPlanId,
      req.user?.id ?? '',
    );
  }
}
