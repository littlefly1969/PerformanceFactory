import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AreasService } from './areas.service';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';

@ApiTags('areas')
@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  @ApiOperation({ summary: 'Elenca aree disponibili' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  list(@Req() req: { user?: { id: string; role: UserRole } }) {
    return this.areas.listAreas(req.user);
  }
}
