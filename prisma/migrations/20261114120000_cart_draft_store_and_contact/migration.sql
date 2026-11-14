-- CartDraft por loja + contato do cliente para a lista "Carrinhos abandonados".
-- Todas as colunas são opcionais: nenhum dado existente muda.
-- "IF NOT EXISTS": a tabela cart_drafts não aparece nas migrations anteriores (o banco foi
-- evoluído fora do histórico), então a migration precisa ser segura se algo já existir.

-- AlterTable
ALTER TABLE "cart_drafts"
  ADD COLUMN IF NOT EXISTS "storeId" TEXT,
  ADD COLUMN IF NOT EXISTS "customerName" TEXT,
  ADD COLUMN IF NOT EXISTS "customerPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "contactCapturedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "contactedAt" TIMESTAMP(3);

-- Rascunhos antigos herdam a loja da sessão a que pertencem
UPDATE "cart_drafts" AS d
SET "storeId" = s."storeId"
FROM "store_sessions" AS s
WHERE s."sessionId" = d."sessionId"
  AND d."storeId" IS NULL
  AND s."storeId" IS NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cart_drafts_storeId_updatedAt_idx" ON "cart_drafts"("storeId", "updatedAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cart_drafts_storeId_fkey'
  ) THEN
    ALTER TABLE "cart_drafts"
      ADD CONSTRAINT "cart_drafts_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
