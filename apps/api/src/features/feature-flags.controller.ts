import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FeatureFlagsService } from './feature-flags.service';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { SetBetaTesterDto } from './dto/beta-tester.dto';

type AuthedRequest = { user?: { id: string } };

@ApiTags('feature-flags')
@Controller()
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get('features/me')
  @ApiOperation({ summary: 'Feature flag attivi per l utente corrente' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  mine(@Req() req: AuthedRequest) {
    return this.flags.forUser(req.user?.id ?? null);
  }

  @Get('public/features')
  @ApiOperation({ summary: 'Feature flag attivi per tutti (visitatori)' })
  everyone() {
    return this.flags.forUser(null);
  }

  @Get('admin/feature-flags')
  @ApiOperation({ summary: 'Elenco feature flag e stato di rilascio' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  list() {
    return this.flags.list();
  }

  @Patch('admin/feature-flags/:key')
  @ApiOperation({ summary: 'Modifica stato, beta e percentuale di un flag' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('key') key: string,
    @Body() body: UpdateFeatureFlagDto,
    @Req() req: AuthedRequest,
  ) {
    return this.flags.update(key, body, req.user!.id);
  }

  @Get('admin/beta-testers')
  @ApiOperation({ summary: 'Elenco beta tester' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  betaTesters() {
    return this.flags.betaTesters();
  }

  @Put('admin/beta-testers')
  @ApiOperation({ summary: 'Aggiunge o toglie un beta tester per email' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  setBetaTester(@Body() body: SetBetaTesterDto, @Req() req: AuthedRequest) {
    return this.flags.setBetaTester(
      body.email,
      body.isBetaTester,
      req.user!.id,
    );
  }
}
