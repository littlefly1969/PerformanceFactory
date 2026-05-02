import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { PlansService } from './plans.service';
import { PlanItemApprovalDto } from './dto/plan-item-approval.dto';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current improvement plan release' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'areaId', required: true })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  getCurrent(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Query('userId') userId?: string,
    @Query('areaId') areaId?: string,
  ) {
    return this.plans.getCurrentPlan(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      userId,
      areaId,
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Get improvement plan history' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'areaId', required: true })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  getHistory(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Query('userId') userId?: string,
    @Query('areaId') areaId?: string,
  ) {
    return this.plans.getPlanHistory(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      userId,
      areaId,
    );
  }

  @Get('approvals/pending')
  @ApiOperation({ summary: 'List pending plan item approvals for professional' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  getPendingApprovals(@Req() req: { user?: { id: string; role: UserRole } }) {
    return this.plans.getPendingApprovalsForProfessional({
      id: req.user?.id ?? '',
      role: req.user?.role ?? UserRole.USER,
    });
  }

  @Post('items/:itemId/approve')
  @ApiOperation({ summary: 'Approve a plan item (professional)' })
  @ApiParam({ name: 'itemId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  approvePlanItem(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('itemId') itemId: string,
  ) {
    return this.plans.approvePlanItem(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      itemId,
    );
  }

  @Post('items/:itemId/reject')
  @ApiOperation({ summary: 'Reject a plan item (professional)' })
  @ApiParam({ name: 'itemId' })
  @ApiBody({ type: PlanItemApprovalDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  rejectPlanItem(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('itemId') itemId: string,
    @Body() body: PlanItemApprovalDto,
  ) {
    return this.plans.rejectPlanItem(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      itemId,
      body.reason,
    );
  }
}
