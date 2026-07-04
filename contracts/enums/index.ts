// Cross-domain enums — used by multiple contract packages AND the frontend.
// Mirrors xfos/database/prisma/schema.prisma and docs/discussions/enums/.
// Keep these three sources in sync.
import { z } from 'zod';

// ---- Tenant ----

export const TenantStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']);
export type TenantStatus = z.infer<typeof TenantStatusEnum>;

export const ServiceModelEnum = z.enum(['STALL_KIOSK', 'DINE_IN_TABLE']);
export type ServiceModel = z.infer<typeof ServiceModelEnum>;

export const PayTimingEnum = z.enum(['PAY_BEFORE', 'PAY_AFTER']);
export type PayTiming = z.infer<typeof PayTimingEnum>;

export const SubscriptionStatusEnum = z.enum([
  'PENDING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusEnum>;

// ---- Auth ----

export const UserStatusEnum = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED']);
export type UserStatus = z.infer<typeof UserStatusEnum>;

export const RoleEnum = z.enum([
  'PLATFORM_ADMIN',
  'PLATFORM_STAFF',
  'TENANT_OWNER',
  'TENANT_MANAGER',
  'SERVICE_STAFF',
  'KITCHEN_STAFF',
]);
export type Role = z.infer<typeof RoleEnum>;

export const InvitationStatusEnum = z.enum(['PENDING', 'ACCEPTED', 'REVOKED']);
export type InvitationStatus = z.infer<typeof InvitationStatusEnum>;

export const AuthProviderEnum = z.enum(['TELEGRAM', 'FACEBOOK', 'PHONE', 'GOOGLE', 'PASSWORD']);
export type AuthProvider = z.infer<typeof AuthProviderEnum>;

// ---- Order ----

export const QrContextTypeEnum = z.enum(['STOREFRONT', 'TABLE']);
export type QrContextType = z.infer<typeof QrContextTypeEnum>;

export const QrDeactivationReasonEnum = z.enum([
  'REGENERATED',
  'MERCHANT_DISABLED',
  'LOST_OR_DAMAGED',
  'EXPIRED_AUTO',
  'TABLE_REMOVED',
  'TENANT_DEACTIVATED',
]);
export type QrDeactivationReason = z.infer<typeof QrDeactivationReasonEnum>;

export const OrderSessionStatusEnum = z.enum(['ACTIVE', 'CLOSED']);
export type OrderSessionStatus = z.infer<typeof OrderSessionStatusEnum>;

export const OrderSessionCloseReasonEnum = z.enum([
  'PAID',
  'STAFF_FORCE_CLOSED',
  'AUTO_TIMEOUT_24H',
  'WALKED_AWAY',
]);
export type OrderSessionCloseReason = z.infer<typeof OrderSessionCloseReasonEnum>;

export const CartStatusEnum = z.enum(['ACTIVE', 'CONVERTED', 'ABANDONED']);
export type CartStatus = z.infer<typeof CartStatusEnum>;

export const CartAbandonedReasonEnum = z.enum([
  'SESSION_PAID',
  'SESSION_FORCE_CLOSED',
  'STAFF_RESET',
  'SESSION_TIMEOUT',
  'CUSTOMER_DISMISSED',
]);
export type CartAbandonedReason = z.infer<typeof CartAbandonedReasonEnum>;

export const OrderStatusEnum = z.enum([
  'SUBMITTED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

export const OrderCancellationReasonEnum = z.enum([
  'CUSTOMER_REQUEST',
  'OUT_OF_STOCK',
  'KITCHEN_OVERLOADED',
  'PAYMENT_FAILED',
  'DUPLICATE',
  'STAFF_ERROR',
  'SYSTEM_TIMEOUT',
]);
export type OrderCancellationReason = z.infer<typeof OrderCancellationReasonEnum>;

export const OrderSourceEnum = z.enum([
  'STOREFRONT_QR',
  'MERCHANT_MANUAL',
  'API',
  'MOBILE_APP',
]);
export type OrderSource = z.infer<typeof OrderSourceEnum>;

export const TableShapeEnum = z.enum(['RECTANGLE', 'CIRCLE']);
export type TableShape = z.infer<typeof TableShapeEnum>;

export const TableStatusEnum = z.enum([
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'CLEANING',
]);
export type TableStatus = z.infer<typeof TableStatusEnum>;

// ---- Billing ----

export const BillStatusEnum = z.enum(['OPEN', 'PARTIALLY_PAID', 'PAID', 'VOIDED']);
export type BillStatus = z.infer<typeof BillStatusEnum>;

export const PaymentStatusEnum = z.enum([
  'INITIATED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const PaymentMethodEnum = z.enum(['CASH', 'ABA_QR', 'CARD']);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

// ---- Kitchen ----

export const TicketStatusEnum = z.enum([
  'NEW',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'SERVED',
]);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

// ---- Audit ----

export const AuditCategoryEnum = z.enum([
  'ORDER',
  'BILLING',
  'KITCHEN',
  'CATALOG',
  'AUTH',
  'TENANT',
  'PLATFORM',
  'SYSTEM',
]);
export type AuditCategory = z.infer<typeof AuditCategoryEnum>;

export const AuditSeverityEnum = z.enum(['INFO', 'NOTICE', 'WARNING', 'ALERT']);
export type AuditSeverity = z.infer<typeof AuditSeverityEnum>;

export const AuditActorTypeEnum = z.enum([
  'USER',
  'SYSTEM',
  'WEBHOOK',
  'CRON',
  'API_KEY',
]);
export type AuditActorType = z.infer<typeof AuditActorTypeEnum>;

// ---- Cross-cutting ----

export const LocaleEnum = z.enum(['en', 'km']);
export type Locale = z.infer<typeof LocaleEnum>;

export const CurrencyEnum = z.enum(['USD', 'KHR']);
export type Currency = z.infer<typeof CurrencyEnum>;

// ---- API utility ----
// Lowercase to match query-string convention (?order=desc).
export const SortDirectionEnum = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof SortDirectionEnum>;
