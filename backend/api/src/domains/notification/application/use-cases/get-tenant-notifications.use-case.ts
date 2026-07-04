import { Injectable, Inject } from '@nestjs/common';
import { ITenantNotificationRepository, TENANT_NOTIFICATION_REPOSITORY_PORT } from '../../core/ports/tenant-notification.repository.port';
import { TenantNotificationEntity } from '../../core/entities/tenant-notification.entity';

export interface GetTenantNotificationsInput {
  tenantId: string;
  userId: string;
  limit?: number;
}

@Injectable()
export class GetTenantNotificationsUseCase {
  constructor(
    @Inject(TENANT_NOTIFICATION_REPOSITORY_PORT)
    private readonly notificationRepository: ITenantNotificationRepository,
  ) {}

  async execute(input: GetTenantNotificationsInput): Promise<TenantNotificationEntity[]> {
    return this.notificationRepository.findManyByTenantAndUser(input.tenantId, input.userId, input.limit);
  }
}
