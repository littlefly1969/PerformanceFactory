import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { CyclesService } from './cycles.service';

@ApiTags('cycles')
@Controller('cycles')
export class CyclesController {
  constructor(private readonly cycles: CyclesService) {}

  @Get(':cycleId/status')
  @ApiOperation({
    summary: 'Ottieni stato ciclo (amministratore/professionista)',
  })
  @ApiParam({ name: 'cycleId' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  getStatus(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Param('cycleId') cycleId: string,
  ) {
    return this.cycles.getStatus(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      cycleId,
    );
  }
}
