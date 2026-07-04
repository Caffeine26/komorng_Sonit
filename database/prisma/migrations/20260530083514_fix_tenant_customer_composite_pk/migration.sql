/*
  Warnings:

  - The primary key for the `tenant_customers` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "tenant_customers" DROP CONSTRAINT "tenant_customers_pkey",
ADD CONSTRAINT "tenant_customers_pkey" PRIMARY KEY ("tenant_id", "id");
