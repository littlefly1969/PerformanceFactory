import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserPlanService } from './user-plan.service';
import { CompletePlanItemDto } from './dto/complete-plan-item.dto';

@ApiTags('user')
@Controller('user')
export class UserPlanController {
  constructor(private readonly userPlan: UserPlanService) {}

  @Get('plan/current')
  @ApiOperation({ summary: 'Ottieni allenamento attivo corrente dell utente' })
  @ApiQuery({ name: 'areaId', required: true })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  getCurrentPlan(
    @Req() req: { user?: { id: string } },
    @Query('areaId') areaId?: string,
  ) {
    return this.userPlan.getCurrentPlan(req.user?.id ?? '', areaId);
  }

  @Get('plan/history')
  @ApiOperation({ summary: 'Ottieni storico allenamento utente' })
  @ApiQuery({ name: 'areaId', required: true })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  getPlanHistory(
    @Req() req: { user?: { id: string } },
    @Query('areaId') areaId?: string,
  ) {
    return this.userPlan.getPlanHistory(req.user?.id ?? '', areaId);
  }

  @Get('training/current')
  @ApiOperation({ summary: 'Ottieni allenamento specifico autonomo corrente' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  getCurrentTraining(@Req() req: { user?: { id: string } }) {
    return this.userPlan.getCurrentTraining(req.user?.id ?? '');
  }

  @Get('training/history')
  @ApiOperation({ summary: 'Ottieni storico allenamenti specifici autonomi' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  getTrainingHistory(@Req() req: { user?: { id: string } }) {
    return this.userPlan.getTrainingHistory(req.user?.id ?? '');
  }

  @Post('plan-items/:id/complete')
  @ApiOperation({ summary: 'Completa una attivita allenamento' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: CompletePlanItemDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  @HttpCode(200)
  completePlanItem(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body() body: CompletePlanItemDto,
  ) {
    return this.userPlan.completePlanItem(req.user?.id ?? '', id, body);
  }

  @Post('training-plan-items/:id/complete')
  @ApiOperation({ summary: 'Completa un esercizio allenamento specifico' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: CompletePlanItemDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  @HttpCode(200)
  completeTrainingPlanItem(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body() body: CompletePlanItemDto,
  ) {
    return this.userPlan.completeTrainingPlanItem(
      req.user?.id ?? '',
      id,
      body,
    );
  }
}
