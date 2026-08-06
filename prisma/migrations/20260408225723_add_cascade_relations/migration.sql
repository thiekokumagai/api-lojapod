/*
  Warnings:

  - A unique constraint covering the columns `[variationId,value,order]` on the table `variation_options` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "product_images" DROP CONSTRAINT "product_images_productId_fkey";

-- DropForeignKey
ALTER TABLE "product_item_options" DROP CONSTRAINT "product_item_options_itemId_fkey";

-- DropForeignKey
ALTER TABLE "product_items" DROP CONSTRAINT "product_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "product_variations" DROP CONSTRAINT "product_variations_productId_fkey";

-- DropForeignKey
ALTER TABLE "variation_options" DROP CONSTRAINT "variation_options_variationId_fkey";

-- DropIndex
DROP INDEX "variation_options_variationId_value_key";

-- CreateIndex
CREATE UNIQUE INDEX "variation_options_variationId_value_order_key" ON "variation_options"("variationId", "value", "order");

-- AddForeignKey
ALTER TABLE "variation_options" ADD CONSTRAINT "variation_options_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "variations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variations" ADD CONSTRAINT "product_variations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_items" ADD CONSTRAINT "product_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_item_options" ADD CONSTRAINT "product_item_options_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "product_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
