-- AlterTable
ALTER TABLE "order_bumps" ADD COLUMN IF NOT EXISTS "triggerCategoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill de regras legadas com triggerCategoryId preenchido
UPDATE "order_bumps"
SET "triggerCategoryIds" = ARRAY["triggerCategoryId"]
WHERE "triggerCategoryId" IS NOT NULL
  AND COALESCE(array_length("triggerCategoryIds", 1), 0) = 0;