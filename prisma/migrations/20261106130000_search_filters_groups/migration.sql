-- AlterTable
ALTER TABLE "store_settings" DROP COLUMN IF EXISTS "searchShortcuts";
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "searchFilters" JSONB;
