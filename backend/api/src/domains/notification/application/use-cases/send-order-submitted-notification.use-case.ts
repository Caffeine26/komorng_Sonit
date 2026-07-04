import { Injectable, Inject, Logger } from '@nestjs/common';
import { OrderEntity } from '../../../order/core/entities/order.entity';
import { ITelegramNotificationService, TELEGRAM_NOTIFICATION_SERVICE } from '../../core/ports/telegram-notification.service.port';
import { INotificationRepository, NOTIFICATION_REPOSITORY_PORT } from '../../core/ports/notification.repository.port';

export interface SendOrderSubmittedNotificationInput {
  order: OrderEntity;
}

@Injectable()
export class SendOrderSubmittedNotificationUseCase {
  private readonly logger = new Logger(SendOrderSubmittedNotificationUseCase.name);

  constructor(
    @Inject(TELEGRAM_NOTIFICATION_SERVICE)
    private readonly telegramService: ITelegramNotificationService,
    @Inject(NOTIFICATION_REPOSITORY_PORT)
    private readonly notificationRepository: INotificationRepository,
  ) {}

  async execute(input: SendOrderSubmittedNotificationInput): Promise<void> {
    const { order } = input;
    if (!order.userId) return;

    try {
      const telegramId = await this.notificationRepository.getTelegramIdByUserId(order.userId);
      if (!telegramId) return;

      const locale = order.locale || 'en';
      const isKm = locale === 'km';

      const hasOldItems = order.items.some((item: any) => item.kitchenStatus !== 'NEW');
      const isUpdate = hasOldItems;

      const itemsList = order.items.map((item: any) => {
        const isNew = item.kitchenStatus === 'NEW';
        const newBadge = isNew && isUpdate ? ' 🆕' : '';
        const nameParts = (item.itemName || '').split(' / ');
        const nameKm = nameParts[0] || item.itemName;
        return `• ${item.quantity}x ${nameKm}${newBadge}`;
      }).join('\n');

      const headerTitle = isUpdate 
        ? `🔄 <b>ការបញ្ជាទិញរបស់លោកអ្នកបានបន្ថែម</b>` 
        : `🛒 <b>ការបញ្ជាទិញរបស់លោកអ្នកទទួលបានជោគជ័យ</b>`;

      const message = `${headerTitle}\n\n` +
        `លេខការបញ្ជាទិញ: #${order.orderNumber}\n\n` +
        `<b>មុខទំនិញ:</b>\n${itemsList}\n\n` +
        `<i>អ្នកនឹងទទួលបានវិក្កយបត្រឌីជីថលនៅពេលរួចរាល់!</i> 🧾`;

      await this.telegramService.sendDirectMessage(telegramId, message, undefined);
      this.logger.log(`Sent order submitted notification to telegramId: ${telegramId} for order ${order.orderNumber}`);
    } catch (err) {
      this.logger.error(`Failed to send order submitted notification:`, err);
    }
  }
}
