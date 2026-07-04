-- A tenant + table can only have one ACTIVE session at a time
CREATE UNIQUE INDEX IF NOT EXISTS "order_sessions_tenant_table_active_idx" 
ON "order_sessions" ("tenant_id", "table_id") 
WHERE "status" = 'ACTIVE' AND "table_id" IS NOT NULL;
