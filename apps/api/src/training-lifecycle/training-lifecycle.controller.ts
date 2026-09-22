import {
  Controller,
  Get,
  Post,
  Req,
  Param,
  UseGuards,
  Header,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TrainingLifecycleOrchestrator } from './training-lifecycle.orchestrator';
type Request = { user: { id: string; role: UserRole } };
@Controller('training/lifecycle')
@ApiTags('training-lifecycle')
@ApiCookieAuth()
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.USER)
export class TrainingLifecycleController {
  constructor(private readonly lifecycle: TrainingLifecycleOrchestrator) {}
  @Post('request')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Richiede o riprende il ciclo di allenamento, senza duplicarlo',
  })
  request(@Req() req: Request) {
    return this.lifecycle.requestPlan(req.user.id);
  }
  @Get('current')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Stato del programma per l’atleta' })
  current(@Req() req: Request) {
    return this.lifecycle.current(req.user.id);
  }
  @Get('coach/plans')
  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Piani pubblicati e in review degli atleti assegnati',
  })
  coachPlans(@Req() req: Request) {
    return this.lifecycle.coachPlans(req.user);
  }
  @Post('releases/:id/approve')
  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  @ApiOperation({ summary: 'Approva e pubblica un piano con policy manuale' })
  approve(@Req() req: Request, @Param('id') id: string) {
    return this.lifecycle.approveManual(id, req.user);
  }
}
