-- AlterTable
ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

-- Preenche a ordem atual (mais antiga primeiro) para as imagens existentes
UPDATE "product_images" pi
SET "position" = ranked.rn - 1
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "productId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "product_images"
) ranked
WHERE pi."id" = ranked."id";
