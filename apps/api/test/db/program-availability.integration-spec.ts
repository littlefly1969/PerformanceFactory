import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { loadOperationalTemplates } from '../../src/discovery/assessment-configuration';
import {
  availabilityForm,
  programAvailability,
  saveAvailability,
} from '../../src/discovery/program-availability';
import { BillingCatalogService } from '../../src/payments/billing-catalog.service';
import { CheckoutService } from '../../src/payments/checkout.service';
import { PaymentProviderRegistry } from '../../src/payments/providers/payment-provider.registry';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';
import { paywallReady } from './paywall-test-helper';

const DAYS = 'training_days_available';
const MINUTES = 'training_session_duration';

describe('Program availability on PostgreSQL', () => {
  let prisma: PrismaClient;
  let db: PrismaService;
  let checkouts: CheckoutService;
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
    process.env.PAYMENTS_STUB_WEBHOOK_SECRET = 'availability-stub-secret';
    db = prisma as unknown as PrismaService;
    const registry = new PaymentProviderRegistry();
    checkouts = new CheckoutService(
      db,
      new BillingCatalogService(db),
      registry,
    );
  }, 60_000);

  afterAll(async () => {
    process.env = env;
    await prisma?.$disconnect();
  });

  async function newUser() {
    return prisma.user.create({
      data: {
        email: `availability-${randomUUID()}@example.test`,
        password: 'unused-test-hash',
        role: 'USER',
      },
    });
  }

  async function templates() {
    const operational = await loadOperationalTemplates(prisma);
    const byKey = (key: string) => operational.find((q) => q.key === key)!;
    return { days: byKey(DAYS), minutes: byKey(MINUTES) };
  }

  /** Paywall raggiunto senza giorni e durata nel profilo. */
  async function withoutAvailability() {
    const user = await newUser();
    await paywallReady(prisma, user.id, 'PROGRAM_3M');
    await prisma.userOnboardingAssessment.update({
      where: { userId: user.id },
      data: { profileJson: {} },
    });
    return user;
  }

  it('uses the profile over the old assessment answer, then falls back to it', async () => {
    const user = await newUser();
    const { days, minutes } = await templates();
    await paywallReady(prisma, user.id, 'PROGRAM_3M');
    const stored = { [days.id]: 5, [minutes.id]: 90 };
    // Modifica dal profilo dopo il vecchio assessment: 2 giorni, 45 minuti.
    await saveAvailability(db, user.id, { [DAYS]: 2, [MINUTES]: 45 });
    expect(await programAvailability(db, user.id, stored)).toEqual([
      { questionId: days.id, value: 2 },
      { questionId: minutes.id, value: 45 },
    ]);
    // Senza un valore valido nel profilo vale la risposta storica.
    await prisma.userOnboardingAssessment.update({
      where: { userId: user.id },
      data: {
        profileJson: { [MINUTES]: { label: 'Minuti', value: 45 } },
      },
    });
    expect(await programAvailability(db, user.id, stored)).toEqual([
      { questionId: days.id, value: 5 },
      { questionId: minutes.id, value: 45 },
    ]);
  });

  it('refuses the checkout without availability and opens it once saved', async () => {
    const user = await withoutAvailability();
    await expect(
      checkouts.start(user, 'PROGRAM_3M', 'MONTHLY'),
    ).rejects.toMatchObject({
      response: { code: 'AVAILABILITY_REQUIRED' },
    });
    expect(
      await prisma.subscription.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(await availabilityForm(db, user.id)).toMatchObject({
      ready: false,
      questions: [
        { key: DAYS, value: null },
        { key: MINUTES, value: null },
      ],
    });

    const saved = await saveAvailability(db, user.id, {
      [DAYS]: 3,
      [MINUTES]: 60,
    });
    expect(saved).toMatchObject({
      ready: true,
      questions: [
        { key: DAYS, value: 3 },
        { key: MINUTES, value: 60 },
      ],
    });
    const checkout = await checkouts.start(user, 'PROGRAM_3M', 'MONTHLY');
    expect(checkout.checkoutUrl).toBeTruthy();
  });

  it('rejects values outside the active options and athletes without a journey', async () => {
    const user = await withoutAvailability();
    await expect(
      saveAvailability(db, user.id, { [DAYS]: 9, [MINUTES]: 60 }),
    ).rejects.toThrow('Risposta non valida');
    expect((await availabilityForm(db, user.id)).ready).toBe(false);

    const stranger = await newUser();
    await expect(
      saveAvailability(db, stranger.id, { [DAYS]: 3, [MINUTES]: 60 }),
    ).rejects.toThrow('Inizia prima il tuo percorso');
  });
});
