import { Injectable, Inject, Logger } from '@nestjs/common';
import { OrderEntity } from '../../../order/core/entities/order.entity';
import { ITelegramNotificationService, TELEGRAM_NOTIFICATION_SERVICE } from '../../core/ports/telegram-notification.service.port';
import { INotificationRepository, NOTIFICATION_REPOSITORY_PORT } from '../../core/ports/notification.repository.port';

export interface SendOrderInvoiceInput {
  order: OrderEntity;
}

@Injectable()
export class SendOrderInvoiceUseCase {
  private readonly logger = new Logger(SendOrderInvoiceUseCase.name);

  constructor(
    @Inject(TELEGRAM_NOTIFICATION_SERVICE)
    private readonly telegramService: ITelegramNotificationService,
    @Inject(NOTIFICATION_REPOSITORY_PORT)
    private readonly notificationRepository: INotificationRepository,
  ) {}

  async execute(input: SendOrderInvoiceInput): Promise<void> {
    const { order } = input;
    if (!order.userId) return;

    try {
      const telegramId = await this.notificationRepository.getTelegramIdByUserId(order.userId);
      if (!telegramId) return;

      const locale = order.locale || 'en';
      const isKm = locale === 'km';

      const dateStr = (order.createdAt || new Date()).toLocaleString('en-US', { 
        year: 'numeric', month: 'short', day: 'numeric', 
        hour: 'numeric', minute: '2-digit', hour12: true 
      });

      const itemsList = order.items.map((item: any) => {
        const itemTotal = (item.lineTotalCents / 100).toFixed(2);
        const nameParts = (item.itemName || '').split(' / ');
        const nameKm = item.itemNameKm || nameParts[0] || item.itemName;
        return `• ${item.quantity}x ${nameKm} — $${itemTotal}`;
      }).join('\n');

      const subtotal = (order.subtotalCents / 100).toFixed(2);
      const tax = (order.taxCents / 100).toFixed(2);
      const total = (order.totalCents / 100).toFixed(2);

      const message = `🧾 <b>វិក្កយបត្រឌីជីថល</b>\n` +
        `លេខការបញ្ជាទិញ: #${order.orderNumber}\n` +
        `កាលបរិច្ឆេទ: ${dateStr}\n\n` +
        `<b>មុខទំនិញ:</b>\n${itemsList}\n\n` +
        `------------------------\n` +
        `សរុប: $${subtotal}\n` +
        (order.taxCents > 0 ? `ពន្ធ: $${tax}\n` : '') +
        `<b>សរុបរួម: $${total}</b>\n` +
        `------------------------\n\n` +
        `សូមអរគុណសម្រាប់ការបញ្ជាទិញរបស់អ្នក! 🙏`;

      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '🧾 រក្សាទុក PDF ទៅកាន់ការជជែក',
              callback_data: `send_pdf:${order.orderToken}`,
            },
          ],
        ],
      };

      await this.telegramService.sendDirectMessage(telegramId, message, replyMarkup);
      this.logger.log(`Sent digital invoice to telegramId: ${telegramId} for order ${order.orderNumber}`);
    } catch (err) {
      this.logger.error(`Failed to send order invoice:`, err);
    }
  }
}
