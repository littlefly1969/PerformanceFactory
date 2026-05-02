import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { ProfessionalService } from './professional.service';
import { RejectionDto } from './dto/rejection.dto';
import { ApprovalDto } from './dto/approval.dto';

@ApiTags('professional-approvals')
@Controller('professional')
export class ProfessionalController {
  constructor(private readonly professional: ProfessionalService) {}

  @Get('approvals')
  @ApiOperation({ summary: 'Professional approval inbox' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  getApprovals(@Req() req: { user?: { id: string; role: UserRole } }) {
    return this.professional.getApprovalsInbox({
      id: req.user?.id ?? '',
      role: req.user?.role ?? UserRole.USER,
    });
  }

  @Post('questionsets/:id/approve')
  @ApiOperation({ summary: 'Approve a question set (per-area)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: ApprovalDto, required: false })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  approveQuestionSet(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('id') id: string,
    @Body() body: ApprovalDto,
  ) {
    return this.professional.approveQuestionSet(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      id,
      body?.approvalId,
    );
  }

  @Post('questionsets/:id/reject')
  @ApiOperation({ summary: 'Reject a question set (per-area)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: RejectionDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  rejectQuestionSet(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('id') id: string,
    @Body() body: RejectionDto,
  ) {
    return this.professional.rejectQuestionSet(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      id,
      body.rejectionReason,
      body.approvalId,
    );
  }

  @Post('plan-items/:id/approve')
  @ApiOperation({ summary: 'Approve a plan item (per-area)' })
  @ApiParam({ name: 'id' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  approvePlanItem(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('id') id: string,
  ) {
    return this.professional.approvePlanItem(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      id,
    );
  }

  @Post('plan-items/:id/reject')
  @ApiOperation({ summary: 'Reject a plan item (per-area)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: RejectionDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  rejectPlanItem(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('id') id: string,
    @Body() body: RejectionDto,
  ) {
    return this.professional.rejectPlanItem(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      id,
      body.rejectionReason,
    );
  }
}
