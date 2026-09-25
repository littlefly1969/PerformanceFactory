import {
  Body,
  BadRequestException,
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
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
import { UpsertConsentDocumentDto } from '../consents/dto/upsert-consent-document.dto';
import {
  CreateDiscoveryTemplateDto,
  ReorderOnboardingTemplatesDto,
  UpdateDiscoveryTemplateDto,
} from './dto/discovery-template.dto';

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
  @ApiOperation({
    summary: 'Anteprima contesto proposta AI prima della generazione',
  })
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
  @ApiOperation({
    summary: 'Genera allenamento autonomo sport-specializzazione',
  })
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

  @Delete('users/:userId')
  @ApiOperation({ summary: 'Elimina definitivamente un atleta' })
  @ApiParam({ name: 'userId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteUser(@Param('userId') userId: string) {
    return this.admin.deleteAthleteCompletely(userId);
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
  @ApiOperation({
    summary: 'Pubblica una nuova versione di documento consenso',
  })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertConsentDocument(
    @Req() req: { user?: { id: string } },
    @Body() body: UpsertConsentDocumentDto,
  ) {
    return this.consents.upsertDocument(body, req.user?.id ?? '');
  }

  @Get('onboarding-templates')
  @ApiOperation({
    summary:
      'Domande discovery con conteggi derivati (configurate, attive, condizionali, percorso massimo)',
  })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @ApiQuery({ name: 'scope', enum: ['DISCOVERY'] })
  @Roles(UserRole.ADMIN)
  onboardingTemplates(@Query('scope') scope?: string) {
    // L'area admin gestisce oggi le sole domande DISCOVERY.
    if (scope !== 'DISCOVERY')
      throw new BadRequestException('Scope non supportato: usa DISCOVERY');
    return this.admin.listDiscoveryTemplates();
  }

  @Post('onboarding-templates')
  @ApiOperation({ summary: 'Crea una domanda discovery, subito operativa' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createOnboardingTemplate(
    @Req() req: { user?: { id: string } },
    @Body() body: CreateDiscoveryTemplateDto,
  ) {
    return this.admin.createDiscoveryTemplate(body, req.user?.id ?? '');
  }

  @Post('onboarding-templates/reorder')
  @ApiOperation({
    summary: 'Riordina tutte le domande discovery in modo atomico',
  })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reorderOnboardingTemplates(
    @Req() req: { user?: { id: string } },
    @Body() body: ReorderOnboardingTemplatesDto,
  ) {
    return this.admin.reorderDiscoveryTemplates(body.ids, req.user?.id ?? '');
  }

  @Patch('onboarding-templates/:id')
  @ApiOperation({ summary: 'Modifica parziale di una domanda discovery' })
  @ApiParam({ name: 'id' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateOnboardingTemplate(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body() body: UpdateDiscoveryTemplateDto,
  ) {
    return this.admin.updateDiscoveryTemplate(id, body, req.user?.id ?? '');
  }

  @Delete('onboarding-templates/:id')
  @ApiOperation({
    summary: 'Elimina una domanda discovery non referenziata',
  })
  @ApiParam({ name: 'id' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteOnboardingTemplate(@Param('id') id: string) {
    return this.admin.deleteDiscoveryTemplate(id);
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
  @ApiOperation({
    summary: 'Pubblica un allenamento approvato dall allenatore',
  })
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
