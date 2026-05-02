import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { QuestionsService } from './questions.service';

@ApiTags('user')
@Controller('user/questions')
export class UserQuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current published question set for user' })
  @ApiQuery({ name: 'areaId', required: true })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  getCurrent(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Query('areaId') areaId?: string,
  ) {
    return this.questions.getCurrentQuestionSet({
      id: req.user?.id ?? '',
      role: req.user?.role ?? UserRole.USER,
    }, undefined, areaId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get question set history for user' })
  @ApiQuery({ name: 'areaId', required: true })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  getHistory(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Query('areaId') areaId?: string,
  ) {
    return this.questions.getQuestionSetHistory({
      id: req.user?.id ?? '',
      role: req.user?.role ?? UserRole.USER,
    }, undefined, areaId);
  }
}
