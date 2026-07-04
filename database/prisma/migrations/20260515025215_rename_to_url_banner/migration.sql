/*
  Warnings:

  - You are about to drop the column `banner_url` on the `menu_categories` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "menu_categories" DROP COLUMN "banner_url",
ADD COLUMN     "url_banner" TEXT;
