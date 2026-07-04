import { randomBytes } from 'crypto';
import { IOrderRepository } from '../../core/ports/order.repository.port';
import { IOrderEventPublisher } from '../../core/ports/order-event-publisher.port';
import { OrderEntity } from '../../core/entities/order.entity';
import { SubmitOrderAdminOutput } from '@xfos/contracts-bff-admin';

import { IOrderSessionRepository } from '../../core/ports/order-session.repository.port';
import { OrderItemVO } from '../../core/value-objects/order-item.vo';



export interface SubmitOrderAdminInput {
  tenantId: string;
  sessionId?: string;
  tableId?: string;
  items: {
    menuItemId: string;
    itemName: string;
    quantity: number;
    unitPriceCents: number;
    variantSnapshot?: any;
    optionsSnapshot?: any;
    notes?: string;
  }[];
  notes?: string;
  createdById: string; // From JWT
  locale?: string;
}

export class SubmitOrderAdminUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly orderEventPublisher: IOrderEventPublisher,
    private readonly orderSessionRepository: IOrderSessionRepository,
  ) {}

  async execute(input: SubmitOrderAdminInput): Promise<SubmitOrderAdminOutput> {
    let tableRef: string | undefined = undefined;
    if (input.tableId) {
      const table = await this.orderSessionRepository.findTableById(input.tenantId, input.tableId);
      if (table) tableRef = table.label;
    }

    const items = input.items.map(item => OrderItemVO.create({
      menuItemId: item.menuItemId,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      variantSnapshot: item.variantSnapshot ?? null,
      optionsSnapshot: item.optionsSnapshot ?? null,
      notes: item.notes ?? undefined,
    }));

    let order: OrderEntity | undefined;

    if (input.sessionId) {
      const openOrder = await this.orderRepository.findOpenOrderBySessionId(
        input.tenantId,
        input.sessionId,
      );

      if (openOrder) {
        await this.orderRepository.appendItemsToOrder(
          input.tenantId,
          openOrder.id as string,
          input.items.map((item) => ({
            menuItemId: item.menuItemId,
            itemName: item.itemName,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            variantSnapshot: item.variantSnapshot ?? null,
            optionsSnapshot: item.optionsSnapshot ?? null,
            notes: item.notes ?? null,
          })),
        );
        const refreshed = await this.orderRepository.findById(
          input.tenantId,
          openOrder.id as string,
        );
        if (!refreshed) {
          throw new Error('Failed to reload order after append');
        }
        order = refreshed;
      }
    }

    if (!order) {
      const orderNumber = await this.orderRepository.allocateOrderNumber(input.tenantId);
      const orderToken = randomBytes(16).toString('hex');

      order = OrderEntity.createFromCounter({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        tableId: input.tableId,
        tableRef,
        items,
        orderNumber,
        orderToken,
        notes: input.notes,
        createdById: input.createdById,
        locale: input.locale,
      });

      await this.orderRepository.save(order);
    }

    // 6. Publish event
    try {
      await this.orderEventPublisher.publishOrderSubmitted(order);
    } catch (err) {
      console.error(`Failed to publish OrderSubmitted event for admin order ${order.id}:`, err);
    }

    // 7. Return output contract
    return {
      orderId: order.id as string,
      orderNumber: order.orderNumber,
      status: 'SUBMITTED',
      totalCents: order.totalCents,
      createdAt: (order.createdAt || new Date()).toISOString(),
    };
  }
}
