import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { GuidanceService } from './guidance.service';
import { CreateGuidanceDto } from './dto/create-guidance.dto';
import { AssignGuidanceDto } from './dto/assign-guidance.dto';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('guidance')
@Controller('guidance')
/**
 * @deprecated Legacy V1 guidance API backed by GuidanceContent/UserAssignment.
 * Current V2+ flows use AI-generated plan releases, question sets and training plans.
 */
export class GuidanceController {
  constructor(private readonly guidance: GuidanceService) {}

  @Post()
  @ApiOperation({
    summary: '[DEPRECATED] Crea contenuto guida legacy V1',
    deprecated: true,
  })
  @ApiBody({ type: CreateGuidanceDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  create(@Body() body: CreateGuidanceDto) {
    return this.guidance.createGuidance(body);
  }

  @Get()
  @ApiOperation({
    summary: '[DEPRECATED] Elenca contenuti guida legacy V1',
    deprecated: true,
  })
  @ApiQuery({ name: 'areaId', required: false })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  list(@Query('areaId') areaId?: string) {
    return this.guidance.listGuidance(areaId);
  }

  @Post('assign')
  @ApiOperation({
    summary: '[DEPRECATED] Assegna guida legacy V1 a un utente',
    deprecated: true,
  })
  @ApiBody({ type: AssignGuidanceDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  assign(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Body() body: AssignGuidanceDto,
  ) {
    return this.guidance.assignGuidance(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      body,
    );
  }
}
