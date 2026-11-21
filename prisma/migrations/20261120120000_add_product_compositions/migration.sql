-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('POD', 'FOOD', 'ACAI');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN "businessType" "BusinessType" NOT NULL DEFAULT 'POD';

-- AlterTable
ALTER TABLE "products" ADD COLUMN "isCustomizable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "isCustomized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "customizationSnapshot" JSONB;

-- CreateTable
CREATE TABLE "composition_groups" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "maxQuantity" INTEGER NOT NULL DEFAULT 1,
    "freeQuantity" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composition_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composition_options" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(10,2) DEFAULT 0,
    "maxQuantityPerItem" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "linkedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composition_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_compositions" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "customMinQuantity" INTEGER,
    "customMaxQuantity" INTEGER,
    "customFreeQuantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_compositions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "composition_groups_storeId_isActive_idx" ON "composition_groups"("storeId", "isActive");

-- CreateIndex
CREATE INDEX "composition_options_groupId_isActive_idx" ON "composition_options"("groupId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "product_compositions_productId_groupId_key" ON "product_compositions"("productId", "groupId");

-- AddForeignKey
ALTER TABLE "composition_groups" ADD CONSTRAINT "composition_groups_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composition_options" ADD CONSTRAINT "composition_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "composition_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composition_options" ADD CONSTRAINT "composition_options_linkedProductId_fkey" FOREIGN KEY ("linkedProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_compositions" ADD CONSTRAINT "product_compositions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_compositions" ADD CONSTRAINT "product_compositions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "composition_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
