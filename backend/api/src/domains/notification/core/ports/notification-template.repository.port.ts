import { NotificationTemplateEntity } from '../entities/notification-template.entity';

export const NOTIFICATION_TEMPLATE_REPOSITORY_PORT = 'NOTIFICATION_TEMPLATE_REPOSITORY_PORT';

export interface INotificationTemplateRepository {
  findManyByTenant(tenantId: string): Promise<NotificationTemplateEntity[]>;
  findById(tenantId: string, id: string): Promise<NotificationTemplateEntity | null>;
  create(entity: Omit<NotificationTemplateEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationTemplateEntity>;
  update(tenantId: string, id: string, entity: Partial<Omit<NotificationTemplateEntity, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>): Promise<NotificationTemplateEntity>;
  delete(tenantId: string, id: string): Promise<void>;
}
