import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../../common/guards/authenticated.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AnomalyStatus,
  listAnomalies,
  reviewAnomaly,
} from './assessment-anomalies';
import {
  ListAnomaliesQuery,
  ReviewAnomalyDto,
} from './dto/assessment-anomaly.dto';

/**
 * Back office: segnalazioni interne sull'assessment (PF-FS-PREPAYWALL §5.3,
 * OP-08). Solo ADMIN; l'AI Tuner e l'atleta non le vedono.
 */
@ApiTags('admin-calibration')
@ApiCookieAuth()
@Controller('admin/assessment-anomalies')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AssessmentAnomalyAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Segnalazioni da esaminare e storico' })
  list(@Query() query: ListAnomaliesQuery) {
    return listAnomalies(this.prisma, query.status as AnomalyStatus);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Esamina, archivia o riapre una segnalazione' })
  review(
    @Req() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewAnomalyDto,
  ) {
    return reviewAnomaly(
      this.prisma,
      id,
      req.user.id,
      body.status as AnomalyStatus,
      body.note?.trim() || null,
    );
  }
}
