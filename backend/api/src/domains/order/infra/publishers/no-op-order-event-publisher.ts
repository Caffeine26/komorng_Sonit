import { Injectable, Logger } from '@nestjs/common';
import { IOrderEventPublisher } from '../../core/ports/order-event-publisher.port';
import { OrderEntity } from '../../core/entities/order.entity';

@Injectable()
export class NoOpOrderEventPublisher implements IOrderEventPublisher {
  private readonly logger = new Logger(NoOpOrderEventPublisher.name);

  async publishOrderSubmitted(order: OrderEntity): Promise<void> {
    this.logger.log(`[OrderEventPublisher] Order submitted: ${order.orderNumber}. No-op publisher active.`);
  }
}
