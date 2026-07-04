-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ServiceModel" AS ENUM ('STALL_KIOSK', 'DINE_IN_TABLE');

-- CreateEnum
CREATE TYPE "PayTiming" AS ENUM ('PAY_BEFORE', 'PAY_AFTER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLATFORM_ADMIN', 'PLATFORM_STAFF', 'TENANT_OWNER', 'TENANT_MANAGER', 'SERVICE_STAFF', 'KITCHEN_STAFF');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "QrContextType" AS ENUM ('STOREFRONT', 'TABLE');

-- CreateEnum
CREATE TYPE "QrDeactivationReason" AS ENUM ('REGENERATED', 'MERCHANT_DISABLED', 'LOST_OR_DAMAGED', 'EXPIRED_AUTO', 'TABLE_REMOVED', 'TENANT_DEACTIVATED');

-- CreateEnum
CREATE TYPE "OrderSessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderSessionCloseReason" AS ENUM ('PAID', 'STAFF_FORCE_CLOSED', 'AUTO_TIMEOUT_24H', 'WALKED_AWAY');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CartAbandonedReason" AS ENUM ('SESSION_PAID', 'SESSION_FORCE_CLOSED', 'STAFF_RESET', 'SESSION_TIMEOUT', 'CUSTOMER_DISMISSED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'SUBMITTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderCancellationReason" AS ENUM ('CUSTOMER_REQUEST', 'OUT_OF_STOCK', 'KITCHEN_OVERLOADED', 'PAYMENT_FAILED', 'DUPLICATE', 'STAFF_ERROR', 'SYSTEM_TIMEOUT');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('STOREFRONT_QR', 'MERCHANT_MANUAL', 'API', 'MOBILE_APP');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('RECTANGLE', 'CIRCLE');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'ABA_QR', 'CARD');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'SERVED');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('TELEGRAM', 'FACEBOOK', 'PHONE', 'PASSWORD');

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('ORDER', 'BILLING', 'KITCHEN', 'CATALOG', 'AUTH', 'TENANT', 'PLATFORM', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'NOTICE', 'WARNING', 'ALERT');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'WEBHOOK', 'CRON', 'API_KEY');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'km');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'KHR');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code_prefix" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_km" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "service_model" "ServiceModel" NOT NULL DEFAULT 'STALL_KIOSK',
    "pay_timing" "PayTiming" NOT NULL DEFAULT 'PAY_BEFORE',
    "default_locale" "Locale" NOT NULL DEFAULT 'km',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Phnom_Penh',
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "auto_accept_orders" BOOLEAN NOT NULL DEFAULT true,
    "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "tax_inclusive" BOOLEAN NOT NULL DEFAULT true,
    "business_contacts" JSONB NOT NULL DEFAULT '[]',
    "description" JSONB,
    "address" JSONB,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "google_maps_url" TEXT,
    "primary_color" TEXT,
    "logo_url" TEXT,
    "cover_image_url" TEXT,
    "social_links" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "tenant_operating_hours" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "open_time" TIME NOT NULL,
    "close_time" TIME NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_operating_hours_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "tenant_payment_methods" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "provider" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_payment_methods_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "setup_progress" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "profile_completed_at" TIMESTAMP(3),
    "menu_completed_at" TIMESTAMP(3),
    "translations_completed_at" TIMESTAMP(3),
    "payments_configured_at" TIMESTAMP(3),
    "qr_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "went_live_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setup_progress_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "tenant_health" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "translations_healthy" BOOLEAN NOT NULL DEFAULT true,
    "payments_healthy" BOOLEAN NOT NULL DEFAULT true,
    "menu_has_visible_items" BOOLEAN NOT NULL DEFAULT true,
    "translations_broken_at" TIMESTAMP(3),
    "payments_broken_at" TIMESTAMP(3),
    "menu_broken_at" TIMESTAMP(3),
    "untranslated_item_count" INTEGER NOT NULL DEFAULT 0,
    "disabled_payment_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_health_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_km" TEXT NOT NULL,
    "tagline_en" TEXT,
    "tagline_km" TEXT,
    "highlight_label_en" TEXT,
    "highlight_label_km" TEXT,
    "price_cents" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "billing_interval" TEXT NOT NULL DEFAULT 'MONTHLY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "plan_code" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "billing_interval" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_sequences" (
    "tenant_id" TEXT NOT NULL,
    "next_order_counter" INTEGER NOT NULL DEFAULT 1,
    "counters_reset_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_bill_number" BIGINT NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_sequences_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "full_name" TEXT,
    "avatar_url" TEXT,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone_verified_at" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_auth_providers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_id" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "metadata" JSONB,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_auth_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_otp_attempts" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMP(3),
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_otp_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "email" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'telegram',
    "channel_id" TEXT,
    "role" "Role" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "invited_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name_km" TEXT NOT NULL,
    "name_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "category_id" TEXT,
    "name_km" TEXT NOT NULL,
    "name_en" TEXT,
    "description_km" TEXT,
    "description_en" TEXT,
    "base_price_cents" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "sku" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "menu_item_images" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "alt_text_km" TEXT,
    "alt_text_en" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_item_images_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "menu_item_variants" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "name_km" TEXT NOT NULL,
    "name_en" TEXT,
    "price_cents" INTEGER NOT NULL,
    "sku" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "menu_item_variants_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "menu_item_option_groups" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "name_km" TEXT NOT NULL,
    "name_en" TEXT,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_option_groups_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "menu_item_options" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "option_group_id" TEXT NOT NULL,
    "name_km" TEXT NOT NULL,
    "name_en" TEXT,
    "price_delta_cents" INTEGER NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_options_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "floor_plans" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 1000,
    "height" INTEGER NOT NULL DEFAULT 800,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plans_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "tables" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "floor_plan_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" INTEGER,
    "area" TEXT,
    "shape" "TableShape" NOT NULL DEFAULT 'RECTANGLE',
    "position_x" INTEGER NOT NULL,
    "position_y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "current_status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "qr_contexts" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "table_id" TEXT,
    "replaces_id" TEXT,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "context_type" "QrContextType" NOT NULL DEFAULT 'STOREFRONT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT,
    "deactivated_at" TIMESTAMP(3),
    "deactivated_by_id" TEXT,
    "deactivation_reason" "QrDeactivationReason",
    "scan_count" INTEGER NOT NULL DEFAULT 0,
    "last_scanned_at" TIMESTAMP(3),
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "last_printed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_contexts_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "order_sessions" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "qr_context_id" TEXT,
    "table_id" TEXT,
    "table_ref" TEXT,
    "status" "OrderSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "closed_reason" "OrderSessionCloseReason",
    "version" INTEGER NOT NULL DEFAULT 1,
    "party_size" SMALLINT,
    "notes" TEXT,
    "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL DEFAULT 0,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opened_by_id" TEXT,
    "server_id" TEXT,
    "closed_by_id" TEXT,

    CONSTRAINT "order_sessions_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "carts" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "abandoned_reason" "CartAbandonedReason",
    "closed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "cart_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "variant_snapshot" JSONB,
    "options_snapshot" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "orders" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "qr_context_id" TEXT,
    "table_id" TEXT,
    "order_date" DATE NOT NULL,
    "order_number" TEXT NOT NULL,
    "order_token" TEXT NOT NULL,
    "order_token_expires_at" TIMESTAMP(3),
    "status" "OrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "service_model" "ServiceModel" NOT NULL,
    "pay_timing" "PayTiming" NOT NULL,
    "source" "OrderSource" NOT NULL DEFAULT 'STOREFRONT_QR',
    "table_ref" TEXT,
    "subtotal_cents" INTEGER NOT NULL,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "service_charge_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "cancellation_reason" "OrderCancellationReason",
    "cancelled_by_id" TEXT,
    "created_by_id" TEXT,
    "estimated_ready_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "preparing_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "menu_item_id" TEXT,
    "item_name" TEXT NOT NULL,
    "variant_snapshot" JSONB,
    "options_snapshot" JSONB,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "line_subtotal_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "notes" TEXT,
    "kitchen_status" "TicketStatus",
    "prepared_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_reason" "OrderCancellationReason",
    "cancellation_reason_text" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "cancellation_reason" "OrderCancellationReason",
    "reason" TEXT,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_label" TEXT,
    "changed_by_id" TEXT,
    "request_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_body_hash" TEXT NOT NULL,
    "response_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_label" TEXT,
    "user_id" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "bills" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "table_id" TEXT,
    "table_ref" TEXT,
    "bill_number" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'OPEN',
    "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "service_charge_cents" INTEGER NOT NULL DEFAULT 0,
    "tip_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL DEFAULT 0,
    "amount_paid_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "paid_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "bill_orders" (
    "tenant_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_orders_pkey" PRIMARY KEY ("tenant_id","bill_id","order_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "provider" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amount_cents" INTEGER NOT NULL,
    "refunded_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "reference" TEXT,
    "idempotency_key" TEXT,
    "gateway_event_id" TEXT,
    "gateway_signature" TEXT,
    "gateway_data" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "initiated_at" TIMESTAMP(3),
    "pending_at" TIMESTAMP(3),
    "succeeded_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" TEXT,
    "refunded_at" TIMESTAMP(3),
    "refunded_by_id" TEXT,
    "refund_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "kitchen_tickets" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "service_model" "ServiceModel" NOT NULL,
    "table_ref" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "expedite_at" TIMESTAMP(3),
    "estimated_ready_at" TIMESTAMP(3),
    "printed_at" TIMESTAMP(3),
    "started_by_id" TEXT,
    "marked_ready_by_id" TEXT,
    "completed_by_id" TEXT,
    "cancelled_by_id" TEXT,
    "cancellation_reason" "OrderCancellationReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitchen_tickets_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "kitchen_ticket_events" (
    "tenant_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'STATUS_CHANGE',
    "from_status" TEXT,
    "to_status" TEXT,
    "cancellation_reason" "OrderCancellationReason",
    "actor_type" "AuditActorType" NOT NULL,
    "actor_label" TEXT,
    "changed_by_id" TEXT,
    "request_id" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_ticket_events_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "category" "AuditCategory" NOT NULL,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "action" TEXT NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_label" TEXT,
    "user_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "previous_state" JSONB,
    "new_state" JSONB,
    "metadata" JSONB,
    "request_id" TEXT,
    "auth_session_id" TEXT,
    "idempotency_key" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "retention_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_prefix_key" ON "tenants"("code_prefix");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_tenant_id_key" ON "tenant_settings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_operating_hours_tenant_id_day_of_week_open_time_key" ON "tenant_operating_hours"("tenant_id", "day_of_week", "open_time");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payment_methods_tenant_id_method_provider_key" ON "tenant_payment_methods"("tenant_id", "method", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "setup_progress_tenant_id_key" ON "setup_progress"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_health_tenant_id_key" ON "tenant_health"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plan_features_plan_id_idx" ON "plan_features"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_plan_id_feature_key_key" ON "plan_features"("plan_id", "feature_key");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "user_auth_providers_user_id_idx" ON "user_auth_providers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_providers_provider_provider_id_key" ON "user_auth_providers"("provider", "provider_id");

-- CreateIndex
CREATE INDEX "phone_otp_attempts_phone_created_at_idx" ON "phone_otp_attempts"("phone", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_tenant_id_idx" ON "user_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_tenant_id_idx" ON "refresh_tokens"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_idx" ON "invitations"("tenant_id");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_status_idx" ON "invitations"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "menu_items_tenant_id_category_id_idx" ON "menu_items"("tenant_id", "category_id");

-- CreateIndex
CREATE INDEX "idx_menu_item_images_item_order" ON "menu_item_images"("tenant_id", "menu_item_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_item_option_groups_tenant_id_menu_item_id_sort_order_idx" ON "menu_item_option_groups"("tenant_id", "menu_item_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_item_options_tenant_id_option_group_id_sort_order_idx" ON "menu_item_options"("tenant_id", "option_group_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "qr_contexts_token_key" ON "qr_contexts"("token");

-- CreateIndex
CREATE INDEX "order_sessions_tenant_id_status_idx" ON "order_sessions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "order_sessions_tenant_id_opened_at_idx" ON "order_sessions"("tenant_id", "opened_at" DESC);

-- CreateIndex
CREATE INDEX "carts_tenant_id_status_idx" ON "carts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "carts_tenant_id_session_id_idx" ON "carts"("tenant_id", "session_id");

-- CreateIndex
CREATE INDEX "cart_items_tenant_id_cart_id_idx" ON "cart_items"("tenant_id", "cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_token_key" ON "orders"("order_token");

-- CreateIndex
CREATE INDEX "orders_tenant_id_status_idx" ON "orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "orders_tenant_id_session_id_idx" ON "orders"("tenant_id", "session_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_qr_context_id_idx" ON "orders"("tenant_id", "qr_context_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_table_id_idx" ON "orders"("tenant_id", "table_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_created_at_idx" ON "orders"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenant_day_number_unique" ON "orders"("tenant_id", "order_date", "order_number");

-- CreateIndex
CREATE INDEX "order_items_tenant_id_order_id_idx" ON "order_items"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "order_items_tenant_id_menu_item_id_idx" ON "order_items"("tenant_id", "menu_item_id");

-- CreateIndex
CREATE INDEX "order_status_history_tenant_id_order_id_created_at_idx" ON "order_status_history"("tenant_id", "order_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_tenant_id_key_endpoint_key" ON "idempotency_keys"("tenant_id", "key", "endpoint");

-- CreateIndex
CREATE INDEX "bills_tenant_id_status_idx" ON "bills"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "bills_tenant_id_session_id_idx" ON "bills"("tenant_id", "session_id");

-- CreateIndex
CREATE INDEX "bills_tenant_id_table_id_idx" ON "bills"("tenant_id", "table_id");

-- CreateIndex
CREATE INDEX "bills_tenant_id_created_at_idx" ON "bills"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "bills_tenant_id_bill_number_key" ON "bills"("tenant_id", "bill_number");

-- CreateIndex
CREATE INDEX "bill_orders_tenant_id_order_id_idx" ON "bill_orders"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_bill_id_idx" ON "payments"("tenant_id", "bill_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_status_idx" ON "payments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "kitchen_tickets_tenant_id_status_idx" ON "kitchen_tickets"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_tickets_tenant_id_ticket_number_key" ON "kitchen_tickets"("tenant_id", "ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_tickets_tenant_id_order_id_key" ON "kitchen_tickets"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "kitchen_ticket_events_tenant_id_ticket_id_created_at_idx" ON "kitchen_ticket_events"("tenant_id", "ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_category_created_at_idx" ON "audit_logs"("category", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_operating_hours" ADD CONSTRAINT "tenant_operating_hours_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payment_methods" ADD CONSTRAINT "tenant_payment_methods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_progress" ADD CONSTRAINT "setup_progress_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_health" ADD CONSTRAINT "tenant_health_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_sequences" ADD CONSTRAINT "tenant_sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_auth_providers" ADD CONSTRAINT "user_auth_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "menu_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_images" ADD CONSTRAINT "menu_item_images_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_images" ADD CONSTRAINT "menu_item_images_tenant_id_menu_item_id_fkey" FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "menu_items"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_tenant_id_menu_item_id_fkey" FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "menu_items"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_option_groups" ADD CONSTRAINT "menu_item_option_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_option_groups" ADD CONSTRAINT "menu_item_option_groups_tenant_id_menu_item_id_fkey" FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "menu_items"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_options" ADD CONSTRAINT "menu_item_options_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_options" ADD CONSTRAINT "menu_item_options_tenant_id_option_group_id_fkey" FOREIGN KEY ("tenant_id", "option_group_id") REFERENCES "menu_item_option_groups"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_tenant_id_floor_plan_id_fkey" FOREIGN KEY ("tenant_id", "floor_plan_id") REFERENCES "floor_plans"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_contexts" ADD CONSTRAINT "qr_contexts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_contexts" ADD CONSTRAINT "qr_contexts_tenant_id_table_id_fkey" FOREIGN KEY ("tenant_id", "table_id") REFERENCES "tables"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_contexts" ADD CONSTRAINT "qr_contexts_tenant_id_replaces_id_fkey" FOREIGN KEY ("tenant_id", "replaces_id") REFERENCES "qr_contexts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_contexts" ADD CONSTRAINT "qr_contexts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_contexts" ADD CONSTRAINT "qr_contexts_deactivated_by_id_fkey" FOREIGN KEY ("deactivated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_tenant_id_qr_context_id_fkey" FOREIGN KEY ("tenant_id", "qr_context_id") REFERENCES "qr_contexts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_tenant_id_table_id_fkey" FOREIGN KEY ("tenant_id", "table_id") REFERENCES "tables"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sessions" ADD CONSTRAINT "order_sessions_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "order_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_tenant_id_cart_id_fkey" FOREIGN KEY ("tenant_id", "cart_id") REFERENCES "carts"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_tenant_id_menu_item_id_fkey" FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "menu_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "order_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_qr_context_id_fkey" FOREIGN KEY ("tenant_id", "qr_context_id") REFERENCES "qr_contexts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_table_id_fkey" FOREIGN KEY ("tenant_id", "table_id") REFERENCES "tables"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_menu_item_id_fkey" FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "menu_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "order_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_tenant_id_table_id_fkey" FOREIGN KEY ("tenant_id", "table_id") REFERENCES "tables"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_orders" ADD CONSTRAINT "bill_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_orders" ADD CONSTRAINT "bill_orders_tenant_id_bill_id_fkey" FOREIGN KEY ("tenant_id", "bill_id") REFERENCES "bills"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_orders" ADD CONSTRAINT "bill_orders_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_bill_id_fkey" FOREIGN KEY ("tenant_id", "bill_id") REFERENCES "bills"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_refunded_by_id_fkey" FOREIGN KEY ("refunded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_marked_ready_by_id_fkey" FOREIGN KEY ("marked_ready_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_ticket_events" ADD CONSTRAINT "kitchen_ticket_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_ticket_events" ADD CONSTRAINT "kitchen_ticket_events_tenant_id_ticket_id_fkey" FOREIGN KEY ("tenant_id", "ticket_id") REFERENCES "kitchen_tickets"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_ticket_events" ADD CONSTRAINT "kitchen_ticket_events_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
