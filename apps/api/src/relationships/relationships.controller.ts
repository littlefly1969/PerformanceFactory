import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RelationshipsService } from './relationships.service';
import { LinkUserDto } from './dto/link-user.dto';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('relationships')
@Controller('relationships')
export class RelationshipsController {
  constructor(private readonly relationships: RelationshipsService) {}

  @Post('link')
  @ApiOperation({ summary: 'Link a user to a professional' })
  @ApiBody({ type: LinkUserDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.PROFESSIONAL)
  async linkUser(
    @Req() req: { user?: { id: string } },
    @Body() body: LinkUserDto,
  ) {
    return this.relationships.linkUser(
      req.user?.id ?? '',
      body.userId,
      body.userEmail,
      body.areaId,
    );
  }

  @Get('my-users')
  @ApiOperation({ summary: 'List linked users' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.PROFESSIONAL)
  async myUsers(@Req() req: { user?: { id: string } }) {
    return this.relationships.getMyUsers(req.user?.id ?? '');
  }

  @Get('my-professionals')
  @ApiOperation({ summary: 'List linked professionals' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  async myProfessionals(@Req() req: { user?: { id: string } }) {
    return this.relationships.getMyProfessionals(req.user?.id ?? '');
  }
}
