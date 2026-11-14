import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  RankingAnnouncementDto,
  RankingConfigDto,
  RankingVisibilityDto,
} from './ranking.dto';
import { RankingService } from './ranking.service';

type AuthedRequest = {
  user: { id: string };
  ip?: string;
  headers?: { 'user-agent'?: string };
};

@ApiTags('ranking')
@ApiCookieAuth()
@Controller()
@UseGuards(AuthenticatedGuard, RolesGuard)
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get('athlete/ranking')
  @Roles(UserRole.USER)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Ranking PF1-PF4: fascia, posizione, classifica vicina e fasce',
  })
  view(@Req() req: AuthedRequest) {
    return this.ranking.view(req.user.id);
  }

  @Post('athlete/ranking/announcement')
  @Roles(UserRole.USER)
  @HttpCode(204)
  @ApiOperation({ summary: 'Segna come mostrato il pop-up della fascia' })
  async announced(
    @Req() req: AuthedRequest,
    @Body() body: RankingAnnouncementDto,
  ) {
    await this.ranking.announced(req.user.id, body.band);
  }

  @Get('athlete/ranking/visibility')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Consenso a comparire nel ranking con il nome' })
  visibility(@Req() req: AuthedRequest) {
    return this.ranking.visibility(req.user.id);
  }

  @Put('athlete/ranking/visibility')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'Concede o revoca il nome nel ranking' })
  setVisibility(@Req() req: AuthedRequest, @Body() body: RankingVisibilityDto) {
    return this.ranking.setVisibility(req.user.id, body.granted, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      source: 'profile',
    });
  }

  @Get('admin/ranking')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Pesi, soglie e fasce del ranking' })
  admin() {
    return this.ranking.adminView();
  }

  @Put('admin/ranking/config')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Modifica pesi di reale e potenziale e soglie' })
  updateConfig(@Req() req: AuthedRequest, @Body() body: RankingConfigDto) {
    return this.ranking.updateConfig(body, req.user.id);
  }
}
