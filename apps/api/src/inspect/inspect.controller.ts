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
  @ApiOperation({ summary: 'Elenca cicli (solo admin)' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listCycles() {
    return this.inspect.listCycles();
  }

  @Get('cycles/:cycleId')
  @ApiOperation({ summary: 'Ottieni dettagli ciclo (solo admin)' })
  @ApiParam({ name: 'cycleId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getCycle(@Param('cycleId') cycleId: string) {
    return this.inspect.getCycle(cycleId);
  }

  @Get('users')
  @ApiOperation({ summary: 'Elenca utenti (solo admin)' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listUsers() {
    return this.inspect.listUsers();
  }

  @Post('users')
  @ApiOperation({ summary: 'Crea utente (solo admin)' })
  @ApiBody({ type: CreateUserDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createUser(@Body() body: CreateUserDto) {
    return this.inspect.createUser(body.email, body.password, body.role);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Ottieni dettagli utente (solo admin)' })
  @ApiParam({ name: 'userId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getUser(@Param('userId') userId: string) {
    return this.inspect.getUser(userId);
  }

  @Get('professionals')
  @ApiOperation({ summary: 'Elenca professionisti (solo admin)' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listProfessionals() {
    return this.inspect.listProfessionals();
  }

  @Get('professionals/:id')
  @ApiOperation({ summary: 'Ottieni dettagli professionista (solo admin)' })
  @ApiParam({ name: 'id' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getProfessional(@Param('id') id: string) {
    return this.inspect.getProfessional(id);
  }

  @Post('links')
  @ApiOperation({ summary: 'Collega utente a professionista (solo admin)' })
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
  @ApiOperation({ summary: 'Assegna competenze professionista (solo admin)' })
  @ApiBody({ type: AssignCompetenceDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  assignCompetences(@Body() body: AssignCompetenceDto) {
    return this.inspect.assignCompetences(body.professionalId, body.areaIds);
  }
}
