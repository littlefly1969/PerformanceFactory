import {
  Controller,
  Body,
  Patch,
  Req,
  Header,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { IsBoolean } from 'class-validator';
import { AiMonitoringService } from './ai-monitoring.service';
import { AiDiagnosticsSettingsService } from './ai-diagnostics-settings.service';
import { AiLogsQueryDto } from './ai-logs-query.dto';
import { AiLogsService } from './ai-logs.service';

class DiagnosticControlDto {
  @IsBoolean() enabled!: boolean;
}

@ApiTags('admin-ai-logs')
@ApiCookieAuth()
@Controller('admin/ai-logs')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AiLogsController {
  constructor(
    private readonly logs: AiLogsService,
    private readonly controls: AiDiagnosticsSettingsService,
    private readonly monitoring: AiMonitoringService,
  ) {}
  @Get('configuration')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Stato e audit della diagnostica AI integrale, solo admin',
  })
  async configuration() {
    return {
      ...(await this.controls.read()),
      writer: this.monitoring.health(),
    };
  }
  @Patch('configuration')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Attiva o disattiva la diagnostica AI integrale con audit admin',
  })
  setConfiguration(
    @Body() body: DiagnosticControlDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.controls.update(body.enabled, req.user.id);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Storico operativo delle chiamate AI con filtri e paginazione',
  })
  list(@Query() query: AiLogsQueryDto) {
    return this.logs.list(query);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Esito completo e tentativi HTTP di un’operazione AI',
  })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.logs.detail(id);
  }
}
