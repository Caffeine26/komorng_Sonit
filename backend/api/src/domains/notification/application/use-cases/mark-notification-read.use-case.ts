import { Injectable, Inject } from '@nestjs/common';
import { NotificationNotFoundError } from '../../core/errors/notification.errors';
import { ITenantNotificationRepository, TENANT_NOTIFICATION_REPOSITORY_PORT } from '../../core/ports/tenant-notification.repository.port';

export interface MarkNotificationReadInput {
  tenantId: string;
  notificationId: string;
}

@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    @Inject(TENANT_NOTIFICATION_REPOSITORY_PORT)
    private readonly notificationRepository: ITenantNotificationRepository,
  ) {}

  async execute(input: MarkNotificationReadInput): Promise<void> {
    const notification = await this.notificationRepository.findById(input.tenantId, input.notificationId);
    if (!notification) {
      throw new NotificationNotFoundError(input.notificationId);
    }

    if (!notification.isRead) {
      await this.notificationRepository.markAsRead(input.tenantId, input.notificationId);
    }
  }
}
