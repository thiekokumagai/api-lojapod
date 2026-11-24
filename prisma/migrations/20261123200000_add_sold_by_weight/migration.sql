-- Venda por peso (balança): produto por kg e peso gravado no item do pedido
CREATE TYPE "WeightSource" AS ENUM ('SCALE', 'MANUAL');

ALTER TABLE "products" ADD COLUMN "isSoldByWeight" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "tareWeightGrams" INTEGER;

ALTER TABLE "order_items" ADD COLUMN "weightKg" DECIMAL(10,3);
ALTER TABLE "order_items" ADD COLUMN "unitPricePerKg" DECIMAL(10,2);
ALTER TABLE "order_items" ADD COLUMN "weightSource" "WeightSource";
