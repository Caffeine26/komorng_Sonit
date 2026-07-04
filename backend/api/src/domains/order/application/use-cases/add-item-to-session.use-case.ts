import { Injectable, Inject } from '@nestjs/common';
import { ActiveSessionNotFoundError, OrderSessionMismatchError, CartMismatchError } from '../../core/errors/order.errors';
import { IOrderRepository, CartItemInput, ORDER_REPOSITORY_PORT } from '../../core/ports/order.repository.port';
// import { OrderEntity } from '../../core/entities/order.entity';

/**
 * Use‑case to append items to an existing active session cart.
 * Guarantees that no new Order row is created – items are added to the
 * same order linked to the session until the session is completed.
 */
@Injectable()
export class AddItemToSessionUseCase {
  constructor(@Inject(ORDER_REPOSITORY_PORT) private readonly orderRepository: IOrderRepository) {}

  /**
   * @param tenantId  Identifier of the tenant.
   * @param sessionId Identifier of the active dining session.
   * @param items     Array of items to append.
   * @param requestId Optional idempotency key (handled at API layer).
   * @returns The existing order id that now contains the new items.
   */
  async execute(params: {
    tenantId: string;
    sessionId: string;
    items: CartItemInput[];
    requestId?: string;
  }): Promise<string> {
    const { tenantId, sessionId, items, requestId } = params;

    // Verify the session/cart is active.
    const cart = await this.orderRepository.findCartBySessionId(tenantId, sessionId);
    if (!cart) {
      throw new ActiveSessionNotFoundError();
    }

    const cartItems = items.map(item => ({
      tenantId,
      cartId: cart.id,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      variantSnapshot: item.variantSnapshot,
      optionsSnapshot: item.optionsSnapshot,
      notes: item.notes ?? null,
    }));

    // Append items – repository implements optimistic locking.
    await this.orderRepository.appendItemsToSession(tenantId, sessionId, items, requestId);

    // Retrieve the order that is linked to this session. The order entity
    // can be obtained via a simple query that filters by sessionId.
    const orders = await this.orderRepository.findByTenant(tenantId, {
      sessionId,
    });
    if (orders.length === 0) {
      throw new OrderSessionMismatchError();
    }
    // Assuming there is exactly one order per active session.
    const order = orders[0];
    if (!order.id) {
      throw new CartMismatchError('Order ID missing');
    }
    return order.id;
  }
}
