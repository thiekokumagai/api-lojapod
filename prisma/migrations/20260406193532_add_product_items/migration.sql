/*
  Warnings:

  - A unique constraint covering the columns `[productId,variationId]` on the table `product_variations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "variation_options" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,

    CONSTRAINT "variation_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "hash" TEXT NOT NULL,

    CONSTRAINT "ProductItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_item_options" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "product_item_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "variation_options_variationId_value_key" ON "variation_options"("variationId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ProductItem_hash_key" ON "ProductItem"("hash");

-- CreateIndex
CREATE INDEX "ProductItem_productId_idx" ON "ProductItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_item_options_itemId_optionId_key" ON "product_item_options"("itemId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "product_variations_productId_variationId_key" ON "product_variations"("productId", "variationId");

-- AddForeignKey
ALTER TABLE "variation_options" ADD CONSTRAINT "variation_options_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "variations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductItem" ADD CONSTRAINT "ProductItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_item_options" ADD CONSTRAINT "product_item_options_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProductItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_item_options" ADD CONSTRAINT "product_item_options_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "variation_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
