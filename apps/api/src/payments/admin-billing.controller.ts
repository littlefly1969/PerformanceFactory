import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BillingCycle, ProgramHorizon, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BillingCatalogService } from './billing-catalog.service';
import {
  UpdateBillingOptionDto,
  UpdateBillingPriceDto,
} from './dto/payments.dto';

/** Back office: prezzi e combinazioni attive non sono mai cablati nel codice (A5). */
@ApiTags('admin-payments')
@ApiCookieAuth()
@Controller('admin/payments')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminBillingController {
  constructor(private readonly catalog: BillingCatalogService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Prezzi per cadenza e matrice orizzonte x cadenza' })
  getCatalog() {
    return this.catalog.adminCatalog();
  }

  @Put('prices/:billingCycle')
  @ApiOperation({ summary: 'Aggiorna il prezzo di una cadenza di pagamento' })
  @ApiParam({ name: 'billingCycle', enum: BillingCycle })
  updatePrice(
    @Param('billingCycle', new ParseEnumPipe(BillingCycle))
    billingCycle: BillingCycle,
    @Body() body: UpdateBillingPriceDto,
  ) {
    return this.catalog.updatePrice(
      billingCycle,
      body.amountCents,
      body.currency,
    );
  }

  @Put('options/:horizon/:billingCycle')
  @ApiOperation({
    summary: 'Attiva o disattiva una combinazione orizzonte x cadenza',
  })
  @ApiParam({ name: 'horizon', enum: ProgramHorizon })
  @ApiParam({ name: 'billingCycle', enum: BillingCycle })
  updateOption(
    @Param('horizon', new ParseEnumPipe(ProgramHorizon))
    horizon: ProgramHorizon,
    @Param('billingCycle', new ParseEnumPipe(BillingCycle))
    billingCycle: BillingCycle,
    @Body() body: UpdateBillingOptionDto,
  ) {
    return this.catalog.updateOption(horizon, billingCycle, body.isActive);
  }
}
