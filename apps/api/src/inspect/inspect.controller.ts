import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
import { InspectService } from './inspect.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminLinkUserDto } from './dto/link-user.dto';
import { AssignCompetenceDto } from './dto/assign-competence.dto';

@ApiTags('inspect')
@Controller('inspect')
export class InspectController {
  constructor(private readonly inspect: InspectService) {}

  @Get('cycles')
  @ApiOperation({ summary: 'List cycles (admin only)' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listCycles() {
    return this.inspect.listCycles();
  }

  @Get('cycles/:cycleId')
  @ApiOperation({ summary: 'Get cycle details (admin only)' })
  @ApiParam({ name: 'cycleId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getCycle(@Param('cycleId') cycleId: string) {
    return this.inspect.getCycle(cycleId);
  }

  @Get('users')
  @ApiOperation({ summary: 'List users (admin only)' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listUsers() {
    return this.inspect.listUsers();
  }

  @Post('users')
  @ApiOperation({ summary: 'Create user (admin only)' })
  @ApiBody({ type: CreateUserDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createUser(@Body() body: CreateUserDto) {
    return this.inspect.createUser(body.email, body.password, body.role);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Get user details (admin only)' })
  @ApiParam({ name: 'userId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getUser(@Param('userId') userId: string) {
    return this.inspect.getUser(userId);
  }

  @Get('professionals')
  @ApiOperation({ summary: 'List professionals (admin only)' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listProfessionals() {
    return this.inspect.listProfessionals();
  }

  @Get('professionals/:id')
  @ApiOperation({ summary: 'Get professional details (admin only)' })
  @ApiParam({ name: 'id' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getProfessional(@Param('id') id: string) {
    return this.inspect.getProfessional(id);
  }

  @Post('links')
  @ApiOperation({ summary: 'Link user to professional (admin only)' })
  @ApiBody({ type: AdminLinkUserDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  linkUser(@Body() body: AdminLinkUserDto) {
    return this.inspect.linkUserToProfessional(
      body.professionalId,
      body.userId,
      body.areaId,
    );
  }

  @Post('competences')
  @ApiOperation({ summary: 'Assign professional competences (admin only)' })
  @ApiBody({ type: AssignCompetenceDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  assignCompetences(@Body() body: AssignCompetenceDto) {
    return this.inspect.assignCompetences(body.professionalId, body.areaIds);
  }
}
