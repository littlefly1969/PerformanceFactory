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
  @ApiOperation({ summary: 'Admin operations dashboard' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  dashboard() {
    return this.admin.getDashboard();
  }

  @Post('orchestrator/run')
  @ApiOperation({ summary: 'Run proposal cycle (admin only)' })
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
  @ApiOperation({ summary: 'Preview AI proposal context before generation' })
  @ApiBody({ type: RunCycleDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  preview(@Body() body: RunCycleDto) {
    const userId = body.userIds?.[0];
    if (!userId || !body.areaId || body.runAllAreas) {
      throw new BadRequestException(
        'Preview requires one user and one target area',
      );
    }
    return this.orchestrator.previewCycleProposalInput(userId, body.areaId);
  }

  @Patch('users/:userId/activate')
  @ApiOperation({ summary: 'Enable a pending athlete account' })
  @ApiParam({ name: 'userId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  activateUser(@Param('userId') userId: string) {
    return this.admin.setUserActive(userId, true);
  }

  @Patch('users/:userId/deactivate')
  @ApiOperation({ summary: 'Disable an athlete account' })
  @ApiParam({ name: 'userId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deactivateUser(@Param('userId') userId: string) {
    return this.admin.setUserActive(userId, false);
  }

  @Get('ai-settings')
  @ApiOperation({ summary: 'Admin AI prompt and onboarding configuration' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  aiSettings() {
    return this.admin.getAiSettings();
  }

  @Post('ai-prompts')
  @ApiOperation({ summary: 'Create or update an AI prompt configuration' })
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
  @ApiOperation({ summary: 'Create or update the athlete goal AI prompt' })
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
    summary: 'Create or update one AI generation configuration per area',
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
  @ApiOperation({ summary: 'Create or update an onboarding question template' })
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
    summary: 'Close published questionnaires that already have all answers',
  })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  closeAnsweredQuestionnaires() {
    return this.admin.closeAnsweredQuestionnaires();
  }

  @Post('cycles/:cycleId/publish')
  @ApiOperation({ summary: 'Publish a cycle (admin only)' })
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
