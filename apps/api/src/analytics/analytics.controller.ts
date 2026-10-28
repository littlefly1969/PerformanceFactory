import {
  Body,
  Controller,
  Get,
  HttpCode,
  ParseIntPipe,
  Post,
  Query,
  DefaultValuePipe,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { TrackEventsDto } from './dto/track-events.dto';

@ApiTags('analytics')
@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('public/events')
  @HttpCode(202)
  @ApiOperation({ summary: 'Eventi anonimi del funnel prima del login' })
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ 'register-athlete': true })
  @Throttle({ 'public-events': { limit: 20, ttl: 60 * 1000 } })
  track(@Body() body: TrackEventsDto) {
    return this.analytics.trackClient(body);
  }

  @Get('admin/analytics/funnel')
  @ApiOperation({ summary: 'Conteggi eventi e registrazioni per circolo' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  funnel(@Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number) {
    if (days < 1 || days > 366)
      throw new BadRequestException('days deve essere tra 1 e 366');
    return this.analytics.funnel(days);
  }
}
