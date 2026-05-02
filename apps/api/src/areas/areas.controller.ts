import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AreasService } from './areas.service';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';

@ApiTags('areas')
@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  @ApiOperation({ summary: 'List available areas' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  list() {
    return this.areas.listAreas();
  }
}
