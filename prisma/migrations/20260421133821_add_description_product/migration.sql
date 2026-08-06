/*
  Warnings:

  - You are about to drop the column `price` on the `product_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "product_items" DROP COLUMN "price";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "description" TEXT,
ADD COLUMN     "descriptionFormated" TEXT;
