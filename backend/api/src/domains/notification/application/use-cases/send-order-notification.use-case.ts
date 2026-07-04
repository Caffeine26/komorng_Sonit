import { Injectable, Inject, Logger } from '@nestjs/common';
import { ITelegramNotificationService, TELEGRAM_NOTIFICATION_SERVICE } from '../../core/ports/telegram-notification.service.port';
import { INotificationRepository, NOTIFICATION_REPOSITORY_PORT } from '../../core/ports/notification.repository.port';

export interface SendOrderNotificationInput {
  customerId: string;
  orderNumber: string;
  status: string;
}

@Injectable()
export class SendOrderNotificationUseCase {
  private readonly logger = new Logger(SendOrderNotificationUseCase.name);

  constructor(
    @Inject(TELEGRAM_NOTIFICATION_SERVICE)
    private readonly telegramService: ITelegramNotificationService,
    @Inject(NOTIFICATION_REPOSITORY_PORT)
    private readonly notificationRepository: INotificationRepository,
  ) {}

  async execute(input: SendOrderNotificationInput): Promise<void> {
    try {
      const telegramId = await this.notificationRepository.getTelegramIdByUserId(input.customerId);
      if (!telegramId) {
        this.logger.debug(`Skipping Telegram notification for order ${input.orderNumber}: customer ${input.customerId} has no connected Telegram account.`);
        return;
      }

      await this.telegramService.sendOrderNotification(telegramId, input.orderNumber, input.status);
    } catch (error) {
      this.logger.error(`Failed to send order notification for order ${input.orderNumber}:`, error);
    }
  }
}
