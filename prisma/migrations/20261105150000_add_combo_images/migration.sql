-- AlterTable
ALTER TABLE "combos" ADD COLUMN IF NOT EXISTS "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Copia a imagem atual para a galeria
UPDATE "combos"
SET "images" = ARRAY["imageUrl"]
WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '' AND ("images" IS NULL OR cardinality("images") = 0);
