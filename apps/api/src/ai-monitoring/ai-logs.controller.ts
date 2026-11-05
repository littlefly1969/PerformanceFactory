import {
  Controller,
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
import { AiLogsQueryDto } from './ai-logs-query.dto';
import { AiLogsService } from './ai-logs.service';

@ApiTags('admin-ai-logs')
@ApiCookieAuth()
@Controller('admin/ai-logs')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AiLogsController {
  constructor(private readonly logs: AiLogsService) {}
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
