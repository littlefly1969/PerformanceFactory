import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { BillingCatalogService } from '../../src/payments/billing-catalog.service';
import { CheckoutService } from '../../src/payments/checkout.service';
import { PaymentWebhooksService } from '../../src/payments/payment-webhooks.service';
import { PaymentProviderRegistry } from '../../src/payments/providers/payment-provider.registry';
import {
  signStubPayload,
  STUB_SIGNATURE_HEADER,
  StubPaymentProvider,
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
  let checkouts: CheckoutService;
  let registry: PaymentProviderRegistry;
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
    registry = new PaymentProviderRegistry();
    catalog = new BillingCatalogService(db);
    checkouts = new CheckoutService(db, catalog, registry);
    subscriptions = new SubscriptionsService(db, registry);
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

    await expect(checkouts.start(user, 'PROGRAM_3M', 'ANNUAL')).rejects.toThrow(
      'non disponibile',
    );

    const checkout = await checkouts.start(user, 'PROGRAM_12M', 'MONTHLY');
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
      checkouts.start(user, 'PROGRAM_3M', 'MONTHLY'),
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

  async function newUser() {
    return prisma.user.create({
      data: {
        email: `payments-${randomUUID()}@example.test`,
        password: 'unused-test-hash',
        role: 'USER',
      },
    });
  }

  function openCount(userId: string) {
    return prisma.subscription.count({
      where: {
        userId,
        status: {
          in: ['CHECKOUT_PENDING', 'ACTIVE', 'PAYMENT_GRACE', 'PAUSED'],
        },
      },
    });
  }

  async function activate(user: { id: string; email: string }) {
    const checkout = await checkouts.start(user, 'PROGRAM_6M', 'MONTHLY');
    const pending = await prisma.subscription.findUniqueOrThrow({
      where: { id: checkout.subscriptionId },
    });
    const subscriptionRef = `stub_sub_${randomUUID()}`;
    await send('CHECKOUT_COMPLETED', {
      checkoutId: pending.providerCheckoutId,
      subscriptionRef,
      occurredAt: '2026-10-07T10:00:00.000Z',
    });
    return { subscriptionId: checkout.subscriptionId, subscriptionRef };
  }

  describe('concurrency and ordering', () => {
    it('gives the same checkout to a double click and keeps one open subscription', async () => {
      const user = await newUser();
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          checkouts.start(user, 'PROGRAM_12M', 'QUARTERLY'),
        ),
      );
      expect(new Set(results.map((r) => r.subscriptionId)).size).toBe(1);
      expect(new Set(results.map((r) => r.checkoutUrl)).size).toBe(1);
      expect(await openCount(user.id)).toBe(1);
      expect(
        await prisma.subscription.count({ where: { userId: user.id } }),
      ).toBe(1);
    });

    it('invalidates a pending checkout when the athlete changes horizon or cycle', async () => {
      const user = await newUser();
      const first = await checkouts.start(user, 'PROGRAM_3M', 'MONTHLY');
      const second = await checkouts.start(user, 'PROGRAM_12M', 'ANNUAL');
      expect(second.subscriptionId).not.toBe(first.subscriptionId);
      const rows = await prisma.subscription.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: { status: true, horizon: true },
      });
      expect(rows).toEqual([
        { status: 'CHECKOUT_EXPIRED', horizon: 'PROGRAM_3M' },
        { status: 'CHECKOUT_PENDING', horizon: 'PROGRAM_12M' },
      ]);
    });

    it('leaves no orphan pending record when the provider fails', async () => {
      const user = await newUser();
      const failing = new StubPaymentProvider();
      failing.createCheckout = () => Promise.reject(new Error('provider down'));
      registry.register(failing);
      try {
        await expect(
          checkouts.start(user, 'PROGRAM_6M', 'MONTHLY'),
        ).rejects.toThrow('non e disponibile');
      } finally {
        registry.register(new StubPaymentProvider());
      }
      expect(await openCount(user.id)).toBe(0);
      expect(
        await prisma.subscription.findFirstOrThrow({
          where: { userId: user.id },
        }),
      ).toMatchObject({ status: 'CHECKOUT_FAILED' });
      await expect(
        checkouts.start(user, 'PROGRAM_6M', 'MONTHLY'),
      ).resolves.toMatchObject({ provider: 'STUB' });
    });

    it('enforces one open subscription per user in the database itself', async () => {
      const user = await newUser();
      await activate(user);
      await expect(
        prisma.subscription.create({
          data: {
            userId: user.id,
            horizon: 'PROGRAM_3M',
            billingCycle: 'MONTHLY',
            provider: 'STUB',
            amountCents: 1990,
            currency: 'eur',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        checkouts.start(user, 'PROGRAM_3M', 'MONTHLY'),
      ).rejects.toThrow('gia un abbonamento attivo');
    });

    it('processes concurrent redeliveries of one event exactly once', async () => {
      const user = await newUser();
      const { subscriptionId, subscriptionRef } = await activate(user);
      const eventId = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          send(
            'PAYMENT_FAILED',
            { subscriptionRef, occurredAt: '2026-10-08T10:00:00.000Z' },
            eventId,
          ),
        ),
      );
      expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
      expect(
        await prisma.paymentEvent.count({
          where: { subscriptionId, providerEventId: eventId },
        }),
      ).toBe(1);
    });

    it('converges to the newest state whatever the processing order', async () => {
      for (const order of [0, 1, 2, 3]) {
        const user = await newUser();
        const { subscriptionId, subscriptionRef } = await activate(user);
        const failed = () =>
          send('PAYMENT_FAILED', {
            subscriptionRef,
            occurredAt: '2026-11-07T10:00:00.000Z',
          });
        const paid = () =>
          send('PAYMENT_SUCCEEDED', {
            subscriptionRef,
            periodEnd: '2026-12-07T10:00:00.000Z',
            occurredAt: '2026-11-07T10:05:00.000Z',
          });
        if (order === 0) {
          await Promise.all([failed(), paid()]);
        } else if (order === 1) {
          await Promise.all([paid(), failed()]);
        } else if (order === 2) {
          await failed();
          await paid();
        } else {
          await paid();
          await failed();
        }
        expect(
          await prisma.subscription.findUniqueOrThrow({
            where: { id: subscriptionId },
          }),
        ).toMatchObject({
          status: 'ACTIVE',
          graceEndsAt: null,
          entitlementEndAt: new Date('2026-12-07T10:00:00.000Z'),
          lastProviderEventAt: new Date('2026-11-07T10:05:00.000Z'),
        });
      }
    });

    it('does not resurrect a subscription with an older event delivered late', async () => {
      const user = await newUser();
      const { subscriptionId, subscriptionRef } = await activate(user);
      await Promise.all([
        send('SUBSCRIPTION_UPDATED', {
          subscriptionRef,
          state: 'ENDED',
          occurredAt: '2026-12-01T10:00:00.000Z',
        }),
        send('SUBSCRIPTION_UPDATED', {
          subscriptionRef,
          state: 'PAST_DUE',
          occurredAt: '2026-11-08T10:00:00.000Z',
        }),
      ]);
      const late = await send('SUBSCRIPTION_UPDATED', {
        subscriptionRef,
        state: 'ACTIVE',
        currentPeriodEnd: '2027-01-07T10:00:00.000Z',
        occurredAt: '2026-11-10T10:00:00.000Z',
      });
      expect(late).toMatchObject({ outcome: 'NO_CHANGE' });
      expect(
        await prisma.subscription.findUniqueOrThrow({
          where: { id: subscriptionId },
        }),
      ).toMatchObject({ status: 'EXPIRED' });
      expect(await openCount(user.id)).toBe(0);
    });
  });
});
