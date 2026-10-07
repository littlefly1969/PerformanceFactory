-- Pagamenti e abbonamenti (Blueprint A4/A5): PROGRAM_HORIZON separato da BILLING_CYCLE.

-- CreateEnum
CREATE TYPE "ProgramHorizon" AS ENUM ('PROGRAM_3M', 'PROGRAM_6M', 'PROGRAM_12M');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "PaymentProviderKind" AS ENUM ('STUB', 'STRIPE');

-- CreateEnum
CREATE TYPE "PurchaseChannel" AS ENUM ('WEB', 'IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('CHECKOUT_PENDING', 'CHECKOUT_EXPIRED', 'CHECKOUT_FAILED', 'ACTIVE', 'PAYMENT_GRACE', 'PAUSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "BillingCyclePrice" (
    "billingCycle" "BillingCycle" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCyclePrice_pkey" PRIMARY KEY ("billingCycle")
);

-- CreateTable
CREATE TABLE "ProgramBillingOption" (
    "horizon" "ProgramHorizon" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramBillingOption_pkey" PRIMARY KEY ("horizon","billingCycle")
);

-- CreateTable
CREATE TABLE "PaymentCustomer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProviderKind" NOT NULL,
    "providerCustomerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "horizon" "ProgramHorizon" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'CHECKOUT_PENDING',
    "provider" "PaymentProviderKind" NOT NULL,
    "purchaseChannel" "PurchaseChannel" NOT NULL DEFAULT 'WEB',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "providerCheckoutId" TEXT,
    "checkoutUrl" TEXT,
    "checkoutExpiresAt" TIMESTAMP(3),
    "providerSubscriptionId" TEXT,
    "providerCustomerId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "entitlementEndAt" TIMESTAMP(3),
    "nextChargeAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "graceEndsAt" TIMESTAMP(3),
    "programStartedAt" TIMESTAMP(3),
    "programEndsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastProviderEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProviderKind" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "outcome" TEXT,
    "subscriptionId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "providerCreatedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCustomer_userId_provider_key" ON "PaymentCustomer"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCustomer_provider_providerCustomerId_key" ON "PaymentCustomer"("provider", "providerCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_provider_providerCheckoutId_key" ON "Subscription"("provider", "providerCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_provider_providerSubscriptionId_key" ON "Subscription"("provider", "providerSubscriptionId");

-- CreateIndex
CREATE INDEX "PaymentEvent_subscriptionId_idx" ON "PaymentEvent"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "PaymentCustomer" ADD CONSTRAINT "PaymentCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariante: al massimo un abbonamento non terminale per utente (doppio click,
-- checkout concorrenti). Indice parziale, non esprimibile nello schema Prisma.
CREATE UNIQUE INDEX "Subscription_one_open_per_user_key" ON "Subscription"("userId")
WHERE "status" IN ('CHECKOUT_PENDING', 'ACTIVE', 'PAYMENT_GRACE', 'PAUSED');

-- Configurazione iniziale da back office. Prezzi = ipotesi A5-D01, ancora da validare.
INSERT INTO "BillingCyclePrice" ("billingCycle","amountCents","currency","updatedAt") VALUES
  ('MONTHLY',1990,'eur',CURRENT_TIMESTAMP),
  ('QUARTERLY',5000,'eur',CURRENT_TIMESTAMP),
  ('SEMIANNUAL',9000,'eur',CURRENT_TIMESTAMP),
  ('ANNUAL',15000,'eur',CURRENT_TIMESTAMP)
ON CONFLICT ("billingCycle") DO NOTHING;

-- Matrice A5: 3M mensile/trimestrale, 6M fino a semestrale, 12M tutti supportati.
-- Per 12M l'insieme commerciale attivo resta da confermare (A5-D02): si disattiva da back office.
INSERT INTO "ProgramBillingOption" ("horizon","billingCycle","isActive","updatedAt") VALUES
  ('PROGRAM_3M','MONTHLY',true,CURRENT_TIMESTAMP),
  ('PROGRAM_3M','QUARTERLY',true,CURRENT_TIMESTAMP),
  ('PROGRAM_6M','MONTHLY',true,CURRENT_TIMESTAMP),
  ('PROGRAM_6M','QUARTERLY',true,CURRENT_TIMESTAMP),
  ('PROGRAM_6M','SEMIANNUAL',true,CURRENT_TIMESTAMP),
  ('PROGRAM_12M','MONTHLY',true,CURRENT_TIMESTAMP),
  ('PROGRAM_12M','QUARTERLY',true,CURRENT_TIMESTAMP),
  ('PROGRAM_12M','SEMIANNUAL',true,CURRENT_TIMESTAMP),
  ('PROGRAM_12M','ANNUAL',true,CURRENT_TIMESTAMP)
ON CONFLICT ("horizon","billingCycle") DO NOTHING;
