import { TenantNotificationEntity } from '../entities/tenant-notification.entity';

export const TENANT_NOTIFICATION_REPOSITORY_PORT = 'TENANT_NOTIFICATION_REPOSITORY_PORT';

export interface ITenantNotificationRepository {
  findManyByTenantAndUser(tenantId: string, userId: string, limit?: number): Promise<TenantNotificationEntity[]>;
  findById(tenantId: string, id: string): Promise<TenantNotificationEntity | null>;
  findByIdGlobal(id: string): Promise<TenantNotificationEntity | null>;
  create(entity: Omit<TenantNotificationEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<TenantNotificationEntity>;
  markAsRead(tenantId: string, id: string): Promise<void>;
  markAsClicked(tenantId: string, id: string): Promise<void>;
}
