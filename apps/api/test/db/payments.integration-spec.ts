import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { BillingCatalogService } from '../../src/payments/billing-catalog.service';
import { PaymentWebhooksService } from '../../src/payments/payment-webhooks.service';
import { PaymentProviderRegistry } from '../../src/payments/providers/payment-provider.registry';
import {
  signStubPayload,
  STUB_SIGNATURE_HEADER,
} from '../../src/payments/providers/stub-payment.provider';
import { SubscriptionsService } from '../../src/payments/subscriptions.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

const SECRET = 'integration-stub-secret';

describe('Payments on PostgreSQL (stub provider)', () => {
  let prisma: PrismaClient;
  let subscriptions: SubscriptionsService;
  let webhooks: PaymentWebhooksService;
  let catalog: BillingCatalogService;
  const env = { ...process.env };

  beforeAll(async () => {
    const databaseUrl = getRequiredTestDatabaseUrl();
    await ensureTestDatabaseExists(databaseUrl);
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    process.env.PAYMENTS_PROVIDER = 'stub';
    process.env.PAYMENTS_STUB_WEBHOOK_SECRET = SECRET;
    const db = prisma as unknown as PrismaService;
    const registry = new PaymentProviderRegistry();
    catalog = new BillingCatalogService(db);
    subscriptions = new SubscriptionsService(db, catalog, registry);
    webhooks = new PaymentWebhooksService(db, registry);
  }, 60_000);

  afterAll(async () => {
    process.env = env;
    await prisma?.$disconnect();
  });

  function send(
    type: string,
    data: Record<string, unknown>,
    id = randomUUID(),
  ) {
    const body = Buffer.from(JSON.stringify({ id, type, data }));
    return webhooks.handle('stub', body, {
      [STUB_SIGNATURE_HEADER]: signStubPayload(body, SECRET),
    });
  }

  it('seeds the Blueprint A5 matrix as configurable data', async () => {
    const offers = await catalog.offers();
    expect(
      offers.map((offer) => [
        offer.horizon,
        offer.billingOptions.map((option) => [
          option.billingCycle,
          option.amountCents,
        ]),
      ]),
    ).toEqual([
      [
        'PROGRAM_3M',
        [
          ['MONTHLY', 1990],
          ['QUARTERLY', 5000],
        ],
      ],
      [
        'PROGRAM_6M',
        [
          ['MONTHLY', 1990],
          ['QUARTERLY', 5000],
          ['SEMIANNUAL', 9000],
        ],
      ],
      [
        'PROGRAM_12M',
        [
          ['MONTHLY', 1990],
          ['QUARTERLY', 5000],
          ['SEMIANNUAL', 9000],
          ['ANNUAL', 15000],
        ],
      ],
    ]);
  });

  it('runs checkout, activation, grace, recovery, cancellation and expiry', async () => {
    const user = await prisma.user.create({
      data: {
        email: `payments-${randomUUID()}@example.test`,
        password: 'unused-test-hash',
        role: 'USER',
      },
    });

    await expect(
      subscriptions.startCheckout(user, 'PROGRAM_3M', 'ANNUAL'),
    ).rejects.toThrow('non disponibile');

    const checkout = await subscriptions.startCheckout(
      user,
      'PROGRAM_12M',
      'MONTHLY',
    );
    expect(checkout.provider).toBe('STUB');
    const pending = await prisma.subscription.findUniqueOrThrow({
      where: { id: checkout.subscriptionId },
    });
    expect(pending).toMatchObject({
      status: 'CHECKOUT_PENDING',
      amountCents: 1990,
    });
    expect((await subscriptions.status(user.id)).entitled).toBe(false);

    const completedId = randomUUID();
    const completed = await send(
      'CHECKOUT_COMPLETED',
      {
        checkoutId: pending.providerCheckoutId,
        subscriptionRef: `stub_sub_${user.id}`,
        customerRef: `stub_cus_${user.id}`,
      },
      completedId,
    );
    expect(completed).toMatchObject({ duplicate: false, outcome: 'ACTIVATED' });
    const duplicate = await send(
      'CHECKOUT_COMPLETED',
      { checkoutId: pending.providerCheckoutId },
      completedId,
    );
    expect(duplicate).toEqual({ received: true, duplicate: true });

    const status = await subscriptions.status(user.id);
    expect(status.entitled).toBe(true);
    expect(status.subscription).toMatchObject({
      status: 'ACTIVE',
      horizon: 'PROGRAM_12M',
      billingCycle: 'MONTHLY',
      cancelAtPeriodEnd: false,
    });
    await expect(
      subscriptions.startCheckout(user, 'PROGRAM_3M', 'MONTHLY'),
    ).rejects.toThrow('gia un abbonamento attivo');
    expect(
      await prisma.paymentCustomer.findUnique({
        where: { userId_provider: { userId: user.id, provider: 'STUB' } },
      }),
    ).toMatchObject({ providerCustomerId: `stub_cus_${user.id}` });

    const subscriptionRef = `stub_sub_${user.id}`;
    expect(await send('PAYMENT_FAILED', { subscriptionRef })).toMatchObject({
      outcome: 'PAYMENT_GRACE_STARTED',
    });
    expect(await subscriptions.status(user.id)).toMatchObject({
      entitled: true,
      subscription: { status: 'PAYMENT_GRACE' },
    });
    expect(
      await send('PAYMENT_SUCCEEDED', {
        subscriptionRef,
        periodEnd: new Date(Date.now() + 40 * 86_400_000).toISOString(),
      }),
    ).toMatchObject({ outcome: 'PAYMENT_RECOVERED' });

    const cancelled = await subscriptions.setCancelAtPeriodEnd(user.id, true);
    expect(cancelled).toMatchObject({
      cancelAtPeriodEnd: true,
      nextChargeAt: null,
    });
    expect((await subscriptions.status(user.id)).entitled).toBe(true);

    expect(
      await send('SUBSCRIPTION_UPDATED', { subscriptionRef, state: 'ENDED' }),
    ).toMatchObject({ outcome: 'EXPIRED' });
    expect(await subscriptions.status(user.id)).toEqual({
      entitled: false,
      subscription: null,
    });

    const audit = await prisma.paymentEvent.findMany({
      where: { subscriptionId: checkout.subscriptionId },
      orderBy: { receivedAt: 'asc' },
      select: { outcome: true },
    });
    expect(audit.map((row) => row.outcome)).toEqual([
      'ACTIVATED',
      'PAYMENT_GRACE_STARTED',
      'PAYMENT_RECOVERED',
      'EXPIRED',
    ]);
  });
});
