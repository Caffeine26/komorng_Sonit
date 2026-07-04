-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN     "banner_url" TEXT,
ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "cost_cents" INTEGER,
ADD COLUMN     "unit" TEXT;
