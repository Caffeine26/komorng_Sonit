import { Injectable, Inject, Logger } from '@nestjs/common';
import { CustomerNotFoundError } from '../../core/errors/notification.errors';
import { ITelegramNotificationService, TELEGRAM_NOTIFICATION_SERVICE } from '../../core/ports/telegram-notification.service.port';
import { INotificationRepository, NOTIFICATION_REPOSITORY_PORT } from '../../core/ports/notification.repository.port';
import { ITenantCustomerRepository, TENANT_CUSTOMER_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant-customer.repository.port';

export interface SendDirectMessageInput {
  tenantId: string;
  tenantCustomerId: string;
  message: string;
}

@Injectable()
export class SendDirectMessageUseCase {
  private readonly logger = new Logger(SendDirectMessageUseCase.name);

  constructor(
    @Inject(TELEGRAM_NOTIFICATION_SERVICE)
    private readonly telegramService: ITelegramNotificationService,
    @Inject(NOTIFICATION_REPOSITORY_PORT)
    private readonly notificationRepository: INotificationRepository,
    @Inject(TENANT_CUSTOMER_REPOSITORY_PORT)
    private readonly tenantCustomerRepository: ITenantCustomerRepository,
  ) {}

  async execute(input: SendDirectMessageInput): Promise<void> {
    const customer = await this.tenantCustomerRepository.findById(input.tenantId, input.tenantCustomerId);
    
    if (!customer) {
      throw new CustomerNotFoundError(input.tenantCustomerId);
    }

    const telegramId = await this.notificationRepository.getTelegramIdByUserId(customer.userId);
    
    if (!telegramId) {
      this.logger.warn(`Cannot send direct message: No Telegram ID found for customer ${input.tenantCustomerId}`);
      throw new Error('Customer does not have a connected Telegram account');
    }

    await this.telegramService.sendDirectMessage(telegramId, input.message);
  }
}

