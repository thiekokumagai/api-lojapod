-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "searchShortcuts" TEXT[] DEFAULT ARRAY[]::TEXT[];
