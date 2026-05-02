import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { PerformanceService } from './performance.service';

@ApiTags('performance')
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('profile/current')
  @ApiOperation({ summary: 'Get current performance profile snapshot' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  getCurrent(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Query('userId') userId?: string,
  ) {
    return this.performance.getCurrentProfile(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      userId,
    );
  }

  @Get('profile/history')
  @ApiOperation({ summary: 'Get performance profile history' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  getHistory(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Query('userId') userId?: string,
  ) {
    return this.performance.getProfileHistory(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      userId,
    );
  }
}
