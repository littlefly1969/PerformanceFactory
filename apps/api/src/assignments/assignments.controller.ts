import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('assignments')
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('my')
  @ApiOperation({ summary: 'Elenca assegnazioni utente correnti' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  myAssignments(@Req() req: { user?: { id: string } }) {
    return this.assignments.getMyAssignments(req.user?.id ?? '');
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Completa una assegnazione' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  complete(@Req() req: { user?: { id: string } }, @Param('id') id: string) {
    return this.assignments.completeAssignment(req.user?.id ?? '', id);
  }
}
