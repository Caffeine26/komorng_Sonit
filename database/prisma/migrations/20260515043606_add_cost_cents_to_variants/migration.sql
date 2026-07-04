/*
  Warnings:

  - Added the required column `menu_item_id` to the `menu_item_options` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "menu_item_options" ADD COLUMN     "menu_item_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "menu_item_variants" ADD COLUMN     "cost_cents" INTEGER;
