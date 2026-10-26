import { ConflictException } from '@nestjs/common';
import { Subscription, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingCatalogService } from './billing-catalog.service';
import { CheckoutService } from './checkout.service';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';

describe('checkout creation concurrent with a horizon change', () => {
  it.each([0, 61_000])(
    'does not deliver an invalidated checkout (age %i ms)',
    async (age) => {
      let subscription: Subscription | null = null;
      let deliver!: (result: { checkoutId: string; url: string }) => void;
      let entered!: () => void;
      const creation = new Promise<{ checkoutId: string; url: string }>(
        (resolve) => (deliver = resolve),
      );
      const creating = new Promise<void>((resolve) => (entered = resolve));
      const provider = {
        kind: 'STRIPE',
        createCheckout: jest.fn(() => {
          entered();
          return creation;
        }),
        expireCheckout: jest.fn(() => Promise.resolve('EXPIRED')),
      };
      const records = {
        findFirst: () => Promise.resolve(subscription),
        findMany: () => Promise.resolve(subscription ? [subscription] : []),
        create: ({ data }: { data: Partial<Subscription> }) => {
          subscription = {
            ...data,
            id: 'reservation',
            status: 'CHECKOUT_PENDING',
            createdAt: new Date(Date.now() - age),
            providerCheckoutId: null,
            checkoutUrl: null,
          } as Subscription;
          return Promise.resolve(subscription);
        },
        update: ({ data }: { data: Partial<Subscription> }) => {
          Object.assign(subscription!, data);
          return Promise.resolve(subscription);
        },
        updateMany: ({
          where,
          data,
        }: {
          where: { status: SubscriptionStatus };
          data: Partial<Subscription>;
        }) => {
          if (subscription?.status !== where.status)
            return Promise.resolve({ count: 0 });
          Object.assign(subscription, data);
          return Promise.resolve({ count: 1 });
        },
      };
      const tx = {
        $executeRaw: () => Promise.resolve(0),
        subscription: records,
        athleteCalibration: {
          findUnique: () => Promise.resolve({ status: 'PAYWALL_READY' }),
        },
        athleteDiscovery: {
          findUnique: () => Promise.resolve({ programHorizon: 'PROGRAM_3M' }),
        },
      };
      const database = {
        ...tx,
        $transaction: (task: (value: typeof tx) => Promise<unknown>) =>
          task(tx),
        paymentCustomer: { findUnique: () => Promise.resolve(null) },
      };
      const offer = {
        horizon: 'PROGRAM_3M',
        billingCycle: 'MONTHLY',
        billingMonths: 1,
        amountCents: 1000,
        currency: 'EUR',
      };
      const checkout = new CheckoutService(
        database as unknown as PrismaService,
        {
          resolveOffer: () => Promise.resolve(offer),
        } as unknown as BillingCatalogService,
        {
          current: () => provider,
          get: () => provider,
        } as unknown as PaymentProviderRegistry,
      );
      const pending = checkout.start(
        { id: 'athlete', email: 'athlete@example.test' },
        'PROGRAM_3M',
        'MONTHLY',
      );
      await creating;
      if (age > 60_000) {
        await checkout.expireOtherHorizons('athlete', 'PROGRAM_12M');
        expect(subscription!.status).toBe('CHECKOUT_FAILED');
        deliver({
          checkoutId: 'late-3m',
          url: 'https://checkout.example.test/late-3m',
        });
        await expect(pending).rejects.toBeInstanceOf(ConflictException);
        expect(provider.expireCheckout).toHaveBeenCalledWith('late-3m');
        expect(subscription!.status).toBe('CHECKOUT_FAILED');
        return;
      }
      await expect(
        checkout.expireOtherHorizons('athlete', 'PROGRAM_12M'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(subscription!.status).toBe('CHECKOUT_PENDING');
      expect(provider.expireCheckout).not.toHaveBeenCalled();
      deliver({
        checkoutId: 'hosted-3m',
        url: 'https://checkout.example.test/3m',
      });
      await expect(pending).resolves.toMatchObject({
        checkoutUrl: 'https://checkout.example.test/3m',
      });
      await checkout.expireOtherHorizons('athlete', 'PROGRAM_12M');
      expect(provider.expireCheckout).toHaveBeenCalledWith('hosted-3m');
      expect(subscription!.status).toBe('CHECKOUT_EXPIRED');
    },
  );
});
