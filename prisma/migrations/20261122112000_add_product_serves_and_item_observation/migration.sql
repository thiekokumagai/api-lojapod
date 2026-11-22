-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "servesCount" INTEGER;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "observation" TEXT;