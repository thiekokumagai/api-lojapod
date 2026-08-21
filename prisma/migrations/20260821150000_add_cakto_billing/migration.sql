CREATE TYPE "BillingStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED');
CREATE TYPE "BillingPaymentMethod" AS ENUM ('CREDIT_CARD', 'PIX_AUTO', 'UNKNOWN');
CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUSED', 'REFUNDED', 'CHARGEBACK');

CREATE TABLE "store_subscriptions" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'CAKTO',
  "providerCustomerId" TEXT,
  "providerSubscriptionId" TEXT,
  "providerOrderId" TEXT,
  "paymentMethod" "BillingPaymentMethod" NOT NULL DEFAULT 'UNKNOWN',
  "status" "BillingStatus" NOT NULL DEFAULT 'TRIALING',
  "monthlyFee" DECIMAL(10,2) NOT NULL DEFAULT 150.00,
  "supportSelected" BOOLEAN NOT NULL DEFAULT false,
  "supportPaidAt" TIMESTAMP(3),
  "trialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodEndsAt" TIMESTAMP(3),
  "paymentDueAt" TIMESTAMP(3),
  "overdueSince" TIMESTAMP(3),
  "gracePeriodEndsAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "lastProviderSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_payments" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "providerPaymentId" TEXT,
  "providerOrderId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'MONTHLY_FEE',
  "method" "BillingPaymentMethod" NOT NULL DEFAULT 'UNKNOWN',
  "status" "BillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(10,2) NOT NULL,
  "dueAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cakto_webhook_events" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cakto_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_audit_logs" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "storeId" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "before" JSONB,
  "after" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_subscriptions_storeId_key" ON "store_subscriptions"("storeId");
CREATE UNIQUE INDEX "store_subscriptions_providerSubscriptionId_key" ON "store_subscriptions"("providerSubscriptionId");
CREATE UNIQUE INDEX "store_subscriptions_providerOrderId_key" ON "store_subscriptions"("providerOrderId");
CREATE INDEX "store_subscriptions_status_gracePeriodEndsAt_idx" ON "store_subscriptions"("status", "gracePeriodEndsAt");
CREATE UNIQUE INDEX "billing_payments_providerPaymentId_key" ON "billing_payments"("providerPaymentId");
CREATE INDEX "billing_payments_storeId_createdAt_idx" ON "billing_payments"("storeId", "createdAt");
CREATE UNIQUE INDEX "cakto_webhook_events_providerId_key" ON "cakto_webhook_events"("providerId");
CREATE INDEX "admin_audit_logs_storeId_createdAt_idx" ON "admin_audit_logs"("storeId", "createdAt");

INSERT INTO "store_subscriptions" (
  "id", "storeId", "trialStartedAt", "trialEndsAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '7 days',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "stores";

ALTER TABLE "store_subscriptions" ADD CONSTRAINT "store_subscriptions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "store_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
