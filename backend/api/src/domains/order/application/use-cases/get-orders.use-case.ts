import { IOrderRepository } from '../../core/ports/order.repository.port';
import { OrderEntity } from '../../core/entities/order.entity';
import { OrderStatus } from '@xfos/contracts-enums';
import { ListOrdersOutput } from '@xfos/contracts-bff-admin';
import { mapOrderToListItem } from '../mappers/order-list.mapper';

export interface GetOrdersInput {
  tenantId: string;
  status?: OrderStatus;
  sessionId?: string;
  tableId?: string;
  customerId?: string;
  limit?: number;
  offset?: number;
}

export class GetOrdersUseCase {
  constructor(private readonly orderRepository: IOrderRepository) {}

  async execute(input: GetOrdersInput): Promise<ListOrdersOutput> {
    if (input.customerId) {
      const orders = await this.orderRepository.findByCustomerOrSession(input.tenantId, input.customerId);
      const result: ListOrdersOutput = orders.map((order: OrderEntity) => mapOrderToListItem(order));
      return result;
    }

    const orders = await this.orderRepository.findByTenant(input.tenantId, {
      status: input.status,
      sessionId: input.sessionId,
      tableId: input.tableId,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    });

    const groups = new Map<string, OrderEntity[]>();

    for (const order of orders) {
      const isTerminal = order.status === 'COMPLETED' || order.status === 'CANCELLED';
      const key = isTerminal
        ? `${order.sessionId ?? 'none'}-${order.id}`
        : (order.sessionId ?? (order.id as string));

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(order);
    }

    const result: ListOrdersOutput = [];

    for (const [, subOrders] of groups) {
      subOrders.sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      );

      const master = subOrders[subOrders.length - 1];
      result.push(mapOrderToListItem(master));
    }

    return result;
  }
}
