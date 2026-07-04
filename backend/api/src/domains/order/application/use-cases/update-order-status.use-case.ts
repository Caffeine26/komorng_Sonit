import { Injectable, Inject, Logger } from '@nestjs/common';
import { IOrderRepository, ORDER_REPOSITORY_PORT } from '../../core/ports/order.repository.port';
import { OrderNotFoundError } from '../../core/errors/order.errors';
import { OrderStatus, OrderCancellationReason } from '@xfos/contracts-enums';
import { SendOrderNotificationUseCase } from '../../../notification/application/use-cases/send-order-notification.use-case';
import { SendOrderInvoiceUseCase } from '../../../notification/application/use-cases/send-order-invoice.use-case';
import { IOrderSessionRepository, ORDER_SESSION_REPOSITORY_PORT } from '../../core/ports/order-session.repository.port';

export interface UpdateOrderStatusInput {
  tenantId: string;
  orderId: string;
  status: OrderStatus; // PREPARING, READY, COMPLETED, CANCELLED
  cancellationReason?: OrderCancellationReason | null;
  reason?: string; // Optional internal notes for cancellation
  actorId: string; // From JWT
}

@Injectable()
export class UpdateOrderStatusUseCase {
  private readonly logger = new Logger(UpdateOrderStatusUseCase.name);

  constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orderRepository: IOrderRepository,
    @Inject(ORDER_SESSION_REPOSITORY_PORT)
    private readonly orderSessionRepository: IOrderSessionRepository,
    private readonly sendOrderNotificationUseCase: SendOrderNotificationUseCase,
    private readonly sendOrderInvoiceUseCase: SendOrderInvoiceUseCase,
  ) {}

  async execute(input: UpdateOrderStatusInput): Promise<void> {
    // 1. Retrieve the order
    const order = await this.orderRepository.findById(input.tenantId, input.orderId);
    if (!order) {
      throw new OrderNotFoundError(input.orderId);
    }

    // 2. Delegate transition validation to the Entity
    if (input.status === 'CANCELLED') {
      order.cancel(input.cancellationReason, input.actorId);
    } else {
      order.transitionTo(input.status, input.actorId);
    }

    // 3. Save the updated state
    await this.orderRepository.update(order);

    // 4. If the order is transitioning to a terminal state (COMPLETED or CANCELLED) and has a session,
    // check if it's the last active order for that session. If so, close the session.
    if (order.sessionId && (input.status === 'COMPLETED' || input.status === 'CANCELLED')) {
      const sessionOrders = await this.orderRepository.findByTenant(input.tenantId, { sessionId: order.sessionId });
      
      const hasOtherActiveOrders = sessionOrders.some(
        (o) => o.id !== order.id && o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
      );

      if (!hasOtherActiveOrders) {
        await this.orderSessionRepository.updateSession(input.tenantId, order.sessionId, { status: 'CLOSED' });
        this.logger.log(`Session ${order.sessionId} closed as all orders are completed/cancelled.`);
      }
    }

    // 4. Send notification if applicable
    if ((input.status === 'PREPARING' || input.status === 'READY' || input.status === 'CANCELLED') && order.userId) {
      this.sendOrderNotificationUseCase.execute({
        customerId: order.userId,
        orderNumber: order.orderNumber,
        status: input.status,
      }).catch(err => {
        this.logger.error(`Failed to send order notification asynchronously:`, err);
      });
    }

    if (input.status === 'COMPLETED' && order.userId) {
      this.sendOrderInvoiceUseCase.execute({ order }).catch(err => {
        this.logger.error(`Failed to send order invoice asynchronously:`, err);
      });
    }
  }
}

