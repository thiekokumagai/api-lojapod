-- "Peça também": suporte a múltiplos produtos de gatilho (regra OU).
-- Aditiva e idempotente: adiciona triggerProductIds TEXT[] NOT NULL DEFAULT '{}'
-- e faz backfill a partir de triggerProductId para manter retrocompatibilidade.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'order_bumps'
  ) THEN
    ALTER TABLE "order_bumps"
      ADD COLUMN IF NOT EXISTS "triggerProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

    UPDATE "order_bumps"
    SET "triggerProductIds" = ARRAY["triggerProductId"]
    WHERE "triggerProductId" IS NOT NULL
      AND cardinality("triggerProductIds") = 0;
  END IF;
END $$;