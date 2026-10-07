import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BillingCatalogService } from './billing-catalog.service';
import { StartCheckoutDto } from './dto/payments.dto';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { WebhookHeaders } from './providers/payment-provider';
import { SubscriptionsService } from './subscriptions.service';

type AuthenticatedRequest = { user?: { id: string; email?: string } };

function requireUser(req: AuthenticatedRequest) {
  const user = req.user;
  if (!user?.id) {
    throw new BadRequestException('Utente mancante');
  }
  return user;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly catalog: BillingCatalogService,
    private readonly subscriptions: SubscriptionsService,
    private readonly webhooks: PaymentWebhooksService,
  ) {}

  @Get('offers')
  @ApiOperation({
    summary: 'Orizzonti 3/6/12 mesi con le cadenze di pagamento attive',
  })
  offers() {
    return this.catalog.offers();
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Avvia il checkout per orizzonte e cadenza' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  checkout(@Req() req: AuthenticatedRequest, @Body() body: StartCheckoutDto) {
    const user = requireUser(req);
    if (!user.email) {
      throw new BadRequestException('Email utente mancante');
    }
    return this.subscriptions.startCheckout(
      { id: user.id, email: user.email },
      body.horizon,
      body.billingCycle,
    );
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Abbonamento corrente ed entitlement' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  subscription(@Req() req: AuthenticatedRequest) {
    return this.subscriptions.status(requireUser(req).id);
  }

  @Post('subscription/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Disdetta a fine periodo pagato' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  cancel(@Req() req: AuthenticatedRequest) {
    return this.subscriptions.setCancelAtPeriodEnd(requireUser(req).id, true);
  }

  @Post('subscription/resume')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoca la disdetta prima della scadenza' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  resume(@Req() req: AuthenticatedRequest) {
    return this.subscriptions.setCancelAtPeriodEnd(requireUser(req).id, false);
  }

  @Post('webhooks/:provider')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(
    @Param('provider') provider: string,
    @Req() req: { rawBody?: Buffer; headers: WebhookHeaders },
  ) {
    return this.webhooks.handle(provider, req.rawBody, req.headers);
  }
}
