/*
  Warnings:

  - You are about to drop the `ProductItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProductItem" DROP CONSTRAINT "ProductItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "product_item_options" DROP CONSTRAINT "product_item_options_itemId_fkey";

-- DropTable
DROP TABLE "ProductItem";

-- CreateTable
CREATE TABLE "product_items" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "hash" TEXT NOT NULL,

    CONSTRAINT "product_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_items_hash_key" ON "product_items"("hash");

-- CreateIndex
CREATE INDEX "product_items_productId_idx" ON "product_items"("productId");

-- AddForeignKey
ALTER TABLE "product_items" ADD CONSTRAINT "product_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_item_options" ADD CONSTRAINT "product_item_options_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "product_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
