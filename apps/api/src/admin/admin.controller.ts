import {
  Body,
  BadRequestException,
  Controller,
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
import { RunCycleDto } from './dto/run-cycle.dto';
import { AdminService } from './admin.service';
import { UpsertAiPromptConfigDto } from './dto/upsert-ai-prompt-config.dto';
import { UpsertAiAreaGenerationConfigDto } from './dto/upsert-ai-area-generation-config.dto';
import { UpsertOnboardingTemplateDto } from './dto/upsert-onboarding-template.dto';
import { UpsertGoalPromptConfigDto } from './dto/upsert-goal-prompt-config.dto';

@ApiTags('admin-cycles')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly admin: AdminService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Cruscotto operativo admin' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  dashboard() {
    return this.admin.getDashboard();
  }

  @Post('orchestrator/run')
  @ApiOperation({ summary: 'Esegui ciclo proposta (solo admin)' })
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

  @Get('ai-settings')
  @ApiOperation({ summary: 'Configurazione prompt AI e onboarding admin' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  aiSettings() {
    return this.admin.getAiSettings();
  }

  @Post('ai-prompts')
  @ApiOperation({ summary: 'Crea o aggiorna una configurazione prompt AI' })
  @ApiBody({ type: UpsertAiPromptConfigDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertAiPrompt(
    @Req() req: { user?: { id: string } },
    @Body() body: UpsertAiPromptConfigDto,
  ) {
    return this.admin.upsertAiPromptConfig(body, req.user?.id ?? '');
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
  @ApiOperation({ summary: 'Pubblica un ciclo (solo admin)' })
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
}
