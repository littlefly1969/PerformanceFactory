import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FeatureFlagsService } from '../features/feature-flags.service';
import { PartnersService } from './partners.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';

@ApiTags('partners')
@Controller()
export class PartnersController {
  constructor(
    private readonly partners: PartnersService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @Get('admin/partners')
  @ApiOperation({ summary: 'Circoli e partner con utenti attribuiti' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  list() {
    return this.partners.list();
  }

  @Post('admin/partners')
  @ApiOperation({ summary: 'Crea un circolo con il suo codice per link e QR' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() body: CreatePartnerDto) {
    return this.partners.create(body);
  }

  @Patch('admin/partners/:id')
  @ApiOperation({ summary: 'Modifica nome, citta o stato di un circolo' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdatePartnerDto,
  ) {
    return this.partners.update(id, body);
  }

  @Get('athlete/referral')
  @ApiOperation({ summary: 'Link personale per invitare un compagno' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  async referral(@Req() req: { user?: { id: string } }) {
    const userId = req.user!.id;
    if (!(await this.flags.isEnabled('referral_share', userId)))
      throw new NotFoundException('Funzione non disponibile');
    return this.partners.referral(userId);
  }
}
