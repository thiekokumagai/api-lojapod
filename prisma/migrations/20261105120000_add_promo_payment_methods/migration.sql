-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "promoPaymentMethods" TEXT[] DEFAULT ARRAY['pix']::TEXT[];
