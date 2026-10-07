import { Module } from '@nestjs/common';
import { AdminBillingController } from './admin-billing.controller';
import { BillingCatalogService } from './billing-catalog.service';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { PaymentsController } from './payments.controller';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [PaymentsController, AdminBillingController],
  providers: [
    BillingCatalogService,
    SubscriptionsService,
    PaymentWebhooksService,
    PaymentProviderRegistry,
  ],
  exports: [SubscriptionsService],
})
export class PaymentsModule {}
