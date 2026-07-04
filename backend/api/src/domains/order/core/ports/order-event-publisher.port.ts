import { OrderEntity } from '../entities/order.entity';

export interface IOrderEventPublisher {
  /**
   * Published when a new order is successfully submitted and saved to the DB.
   * This is a non-fatal event (if it fails, the order is still considered submitted).
   * Listeners may include: kitchen ticket generation, socket notifications, etc.
   */
  publishOrderSubmitted(order: OrderEntity): Promise<void>;
}

export const ORDER_EVENT_PUBLISHER_PORT = Symbol('IOrderEventPublisher');
