import { OrderEntity } from '../entities/order.entity';
import { OrderStatus } from '@xfos/contracts-enums';

export interface CartItemInput {
  menuItemId: string;
  quantity: number;
  unitPriceCents: number;
  variantSnapshot?: unknown;
  optionsSnapshot?: unknown;
  notes?: string | null;
}

export interface CartSnapshot {
  id: string;
  sessionId: string;
  items: {
    menuItemId: string;
    itemName: string;
    quantity: number;
    unitPriceCents: number;
    variantSnapshot: unknown;
    optionsSnapshot: unknown;
    notes: string | null;
  }[];
}

export interface IOrderRepository {
  // Write
  save(order: OrderEntity, cartIdToConvert?: string): Promise<void>;
  update(order: OrderEntity): Promise<void>;

  // Read
  findById(tenantId: string, orderId: string): Promise<OrderEntity | null>;
  findByToken(token: string): Promise<OrderEntity | null>;
  findHistoryBySessionId(sessionId: string): Promise<OrderEntity[]>;
  findByTenant(tenantId: string, filters?: {
    status?: OrderStatus;
    sessionId?: string;
    tableId?: string;
    limit?: number;
    offset?: number;
  }): Promise<OrderEntity[]>;
  findByCustomerOrSession(tenantId: string, tenantCustomerId?: string | null, sessionId?: string | null): Promise<OrderEntity[]>;

  /** Open order for an active dine-in session (not COMPLETED/CANCELLED). */
  findOpenOrderBySessionId(tenantId: string, sessionId: string): Promise<OrderEntity | null>;

  /** Append cart lines to an existing order; convert cart; spawn a fresh ACTIVE cart. */
  appendCartToOrder(
    tenantId: string,
    orderId: string,
    cart: CartSnapshot,
    cartIdToConvert: string,
  ): Promise<void>;

  appendItemsToOrder(
    tenantId: string,
    orderId: string,
    items: CartSnapshot['items'],
  ): Promise<void>;

  acknowledgeNewItems(tenantId: string, orderId: string): Promise<OrderEntity | null>;

  createActiveCartForSession(tenantId: string, sessionId: string): Promise<void>;

  /**
   * Retrieve the active cart snapshot using the immutable sessionId.
   * Returns null if the session does not exist or the cart is not ACTIVE.
   */
  findCartBySessionId(tenantId: string, sessionId: string): Promise<CartSnapshot | null>;

  /**
   * Append additional items to an existing active session cart.
   * This operation is append‑only and never overwrites the existing item list.
   * It is idempotent when supplied with a unique requestId (handled at the API layer).
   */
  appendItemsToSession(tenantId: string, sessionId: string, items: CartItemInput[], requestId?: string): Promise<void>;
  markCartConverted(tenantId: string, cartId: string): Promise<void>;

  // Sequence (order number allocation)
  allocateOrderNumber(tenantId: string, suffix?: string): Promise<string>;
}

export const ORDER_REPOSITORY_PORT = Symbol('IOrderRepository');
