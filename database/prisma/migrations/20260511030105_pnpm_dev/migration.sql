/*
  Warnings:

  - Made the column `name_en` on table `menu_categories` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "menu_categories" ALTER COLUMN "name_en" SET NOT NULL;
