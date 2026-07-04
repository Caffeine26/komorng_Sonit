import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { INotificationTemplateRepository } from '../../core/ports/notification-template.repository.port';
import { NotificationTemplateEntity } from '../../core/entities/notification-template.entity';

@Injectable()
export class PrismaNotificationTemplateRepository implements INotificationTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapToEntity(model: any): NotificationTemplateEntity {
    return new NotificationTemplateEntity({
      id: model.id,
      tenantId: model.tenantId,
      name: model.name,
      title: model.title,
      body: model.body,
      icon: model.icon,
      buttonText: model.buttonText,
      actionUrl: model.actionUrl,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }

  async findManyByTenant(tenantId: string): Promise<NotificationTemplateEntity[]> {
    const models = await this.prisma.notificationTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return models.map(this.mapToEntity);
  }

  async findById(tenantId: string, id: string): Promise<NotificationTemplateEntity | null> {
    const model = await this.prisma.notificationTemplate.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });
    if (!model) return null;
    return this.mapToEntity(model);
  }

  async create(data: Omit<NotificationTemplateEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationTemplateEntity> {
    const model = await this.prisma.notificationTemplate.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        title: data.title,
        body: data.body,
        icon: data.icon,
        buttonText: data.buttonText,
        actionUrl: data.actionUrl,
      },
    });
    return this.mapToEntity(model);
  }

  async update(tenantId: string, id: string, data: Partial<Omit<NotificationTemplateEntity, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>): Promise<NotificationTemplateEntity> {
    const model = await this.prisma.notificationTemplate.update({
      where: { tenantId_id: { tenantId, id } },
      data,
    });
    return this.mapToEntity(model);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.prisma.notificationTemplate.delete({
      where: { tenantId_id: { tenantId, id } },
    });
  }
}
