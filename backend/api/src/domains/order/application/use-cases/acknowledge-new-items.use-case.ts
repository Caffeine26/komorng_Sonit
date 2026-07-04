import { Injectable, Inject } from '@nestjs/common';
import { IOrderRepository, ORDER_REPOSITORY_PORT } from '../../core/ports/order.repository.port';
import { OrderNotFoundError } from '../../core/errors/order.errors';
import { ListOrdersItem } from '@xfos/contracts-bff-admin';
import { mapOrderToListItem } from '../mappers/order-list.mapper';

export interface AcknowledgeNewItemsInput {
  tenantId: string;
  orderId: string;
}

@Injectable()
export class AcknowledgeNewItemsUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orderRepository: IOrderRepository,
  ) {}

  async execute(input: AcknowledgeNewItemsInput): Promise<ListOrdersItem> {
    const updated = await this.orderRepository.acknowledgeNewItems(
      input.tenantId,
      input.orderId,
    );

    if (!updated) {
      throw new OrderNotFoundError(input.orderId);
    }

    return mapOrderToListItem(updated);
  }
}
