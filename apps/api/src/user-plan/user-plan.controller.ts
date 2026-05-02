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
  @ApiOperation({ summary: 'Get current user active plan' })
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
  @ApiOperation({ summary: 'Get user plan history' })
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

  @Post('plan-items/:id/complete')
  @ApiOperation({ summary: 'Complete a plan item' })
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
}
