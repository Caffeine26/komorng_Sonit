-- CreateTable
CREATE TABLE "tenant_customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_vip" BOOLEAN NOT NULL DEFAULT false,
    "total_spent_cents" INTEGER NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "loyalty_points" INTEGER NOT NULL DEFAULT 0,
    "customer_segment" TEXT,
    "last_visit_at" TIMESTAMP(3),
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_customers_user_id_idx" ON "tenant_customers"("user_id");

-- CreateIndex
CREATE INDEX "tenant_customers_tenant_id_last_visit_at_idx" ON "tenant_customers"("tenant_id", "last_visit_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_customers_tenant_id_user_id_key" ON "tenant_customers"("tenant_id", "user_id");

-- AddForeignKey
ALTER TABLE "tenant_customers" ADD CONSTRAINT "tenant_customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_customers" ADD CONSTRAINT "tenant_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
