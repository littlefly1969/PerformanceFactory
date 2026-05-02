import {
  Body,
  Controller,
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
import { QuestionsService } from './questions.service';
import { AreaApprovalDto } from './dto/area-approval.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateAnswerOptionDto } from './dto/update-answer-option.dto';

@ApiTags('questions')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current open question set' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'areaId', required: true })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  getCurrent(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Query('userId') userId?: string,
    @Query('areaId') areaId?: string,
  ) {
    return this.questions.getCurrentQuestionSet(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      userId,
      areaId,
    );
  }

  @Post(':setId/close')
  @ApiOperation({ summary: 'Close a question set' })
  @ApiParam({ name: 'setId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  close(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('setId') setId: string,
  ) {
    return this.questions.closeQuestionSet(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      setId,
    );
  }

  @Get('approvals/pending')
  @ApiOperation({ summary: 'List pending question approvals for professional' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  getPendingApprovals(@Req() req: { user?: { id: string; role: UserRole } }) {
    return this.questions.getPendingApprovalsForProfessional({
      id: req.user?.id ?? '',
      role: req.user?.role ?? UserRole.USER,
    });
  }

  @Post(':setId/areas/:areaId/approve')
  @ApiOperation({ summary: 'Approve a question set area' })
  @ApiParam({ name: 'setId' })
  @ApiParam({ name: 'areaId' })
  @ApiBody({ type: AreaApprovalDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  approveArea(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('setId') setId: string,
    @Param('areaId') areaId: string,
    @Body() body: AreaApprovalDto,
  ) {
    return this.questions.approveArea(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      setId,
      areaId,
      body.notes,
    );
  }

  @Post(':setId/areas/:areaId/reject')
  @ApiOperation({ summary: 'Reject a question set area' })
  @ApiParam({ name: 'setId' })
  @ApiParam({ name: 'areaId' })
  @ApiBody({ type: AreaApprovalDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  rejectArea(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('setId') setId: string,
    @Param('areaId') areaId: string,
    @Body() body: AreaApprovalDto,
  ) {
    return this.questions.rejectArea(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      setId,
      areaId,
      body.notes,
    );
  }

  @Patch(':setId/questions/:questionId')
  @ApiOperation({ summary: 'Update a question (professional only)' })
  @ApiParam({ name: 'setId' })
  @ApiParam({ name: 'questionId' })
  @ApiBody({ type: UpdateQuestionDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  updateQuestion(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('setId') setId: string,
    @Param('questionId') questionId: string,
    @Body() body: UpdateQuestionDto,
  ) {
    return this.questions.updateQuestion(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      setId,
      questionId,
      body,
    );
  }

  @Patch('questions/:questionId/options/:optionId')
  @ApiOperation({ summary: 'Update an answer option (professional only)' })
  @ApiParam({ name: 'questionId' })
  @ApiParam({ name: 'optionId' })
  @ApiBody({ type: UpdateAnswerOptionDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  updateAnswerOption(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('questionId') questionId: string,
    @Param('optionId') optionId: string,
    @Body() body: UpdateAnswerOptionDto,
  ) {
    return this.questions.updateAnswerOption(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      questionId,
      optionId,
      body,
    );
  }
}
