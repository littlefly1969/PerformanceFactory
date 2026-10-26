import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CoachingVideosService } from './coaching-videos';
import {
  CreateCoachingVideoDto,
  UpdateCoachingVideoDto,
} from './coaching-videos.dto';

@ApiTags('admin-coaching-videos')
@ApiCookieAuth()
@Controller('admin/coaching-videos')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CoachingVideosController {
  constructor(private readonly videos: CoachingVideosService) {}

  @Get()
  @ApiOperation({ summary: 'Archivio dei video di approfondimento' })
  list() {
    return this.videos.list();
  }

  @Post()
  @ApiOperation({ summary: 'Aggiunge un video all’archivio' })
  create(@Body() body: CreateCoachingVideoDto) {
    return this.videos.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifica, attiva o disattiva un video' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCoachingVideoDto,
  ) {
    return this.videos.update(id, body);
  }
}
