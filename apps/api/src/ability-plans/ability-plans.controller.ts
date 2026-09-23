import {
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  Header,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AbilityPlansService } from './ability-plans.service';
@Controller('athlete/abilities')
@ApiTags('ability-plans')
@ApiCookieAuth()
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.USER)
export class AbilityPlansController {
  constructor(private readonly plans: AbilityPlansService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Stato e piani delle proprie abilità abilitate' })
  current(@Req() req: { user: { id: string } }) {
    return this.plans.current(req.user.id);
  }
  @Post('request')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Accoda o riprende i piani mancanti per tutte le abilità',
  })
  request(@Req() req: { user: { id: string } }) {
    return this.plans.request(req.user.id);
  }
}
