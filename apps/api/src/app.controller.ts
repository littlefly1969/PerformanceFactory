import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { AppService } from './app.service';
import { HealthResponseDto } from './common/openapi/openapi.models';

@ApiTags('system')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Identifica il servizio API' })
  @ApiProduces('text/plain')
  @ApiOkResponse({ type: String, example: 'Hello World!' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: 'Verifica che il processo API sia disponibile' })
  @ApiOkResponse({ type: HealthResponseDto })
  health() {
    return { status: 'ok' };
  }
}
