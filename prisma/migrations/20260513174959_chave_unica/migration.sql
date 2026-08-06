/*
  Warnings:

  - A unique constraint covering the columns `[productId,hash]` on the table `product_items` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "product_items_hash_key";

-- CreateIndex
CREATE UNIQUE INDEX "product_items_productId_hash_key" ON "product_items"("productId", "hash");
