import { Injectable, Inject } from '@nestjs/common';
import { NotificationNotFoundError } from '../../core/errors/notification.errors';
import { ITenantNotificationRepository, TENANT_NOTIFICATION_REPOSITORY_PORT } from '../../core/ports/tenant-notification.repository.port';
import { TenantNotificationEntity } from '../../core/entities/tenant-notification.entity';

@Injectable()
export class MarkNotificationClickedUseCase {
  constructor(
    @Inject(TENANT_NOTIFICATION_REPOSITORY_PORT)
    private readonly notificationRepository: ITenantNotificationRepository,
  ) {}

  async execute(notificationId: string): Promise<TenantNotificationEntity> {
    const notification = await this.notificationRepository.findByIdGlobal(notificationId);
    if (!notification) {
      throw new NotificationNotFoundError(notificationId);
    }

    if (!notification.clickedAt) {
      await this.notificationRepository.markAsClicked(notification.tenantId, notificationId);
      notification.clickedAt = new Date();
    }
    
    return notification;
  }
}
