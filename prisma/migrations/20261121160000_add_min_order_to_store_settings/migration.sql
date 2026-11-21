-- AlterTable (idempotente)
ALTER TABLE "store_settings"
ADD COLUMN IF NOT EXISTS "minOrderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "minOrderValue" DECIMAL(10,2);
