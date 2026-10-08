import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../../common/guards/authenticated.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import {
  loadCalibrationSettings,
  updateCalibrationSettings,
} from './calibration-config';
import { UpdateCalibrationConfigDto } from './dto/calibration.dto';

/** Back office: soglia di confidence e tempi della calibrazione (A4-D01 aperto). */
@ApiTags('admin-calibration')
@ApiCookieAuth()
@Controller('admin/calibration-config')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CalibrationAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Parametri correnti della calibrazione' })
  get() {
    return loadCalibrationSettings(this.prisma);
  }

  @Put()
  @ApiOperation({ summary: 'Aggiorna i parametri della calibrazione' })
  update(
    @Req() req: { user: { id: string } },
    @Body() body: UpdateCalibrationConfigDto,
  ) {
    return updateCalibrationSettings(this.prisma, body, req.user.id);
  }
}
