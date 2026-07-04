/*
  Warnings:

  - Added the required column `attributeNameEn` to the `menu_item_variants` table without a default value. This is not possible if the table is not empty.
  - Added the required column `attributeNameKm` to the `menu_item_variants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "menu_item_options" ADD COLUMN     "image_url" TEXT;

-- AlterTable
ALTER TABLE "menu_item_variants" ADD COLUMN     "attributeNameEn" TEXT NOT NULL,
ADD COLUMN     "attributeNameKm" TEXT NOT NULL;
