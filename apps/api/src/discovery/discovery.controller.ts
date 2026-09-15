import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';

@ApiTags('discovery')
@Controller('public')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('athlete-discovery')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Configurazione pubblica della discovery atleta' })
  configuration() {
    return this.discovery.configuration();
  }
}
