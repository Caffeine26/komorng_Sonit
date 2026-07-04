import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ITenantNotificationRepository } from '../../core/ports/tenant-notification.repository.port';
import { TenantNotificationEntity } from '../../core/entities/tenant-notification.entity';

@Injectable()
export class PrismaTenantNotificationRepository implements ITenantNotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapToEntity(model: any): TenantNotificationEntity {
    return new TenantNotificationEntity({
      id: model.id,
      tenantId: model.tenantId,
      userId: model.userId,
      templateId: model.templateId,
      title: model.title,
      body: model.body,
      icon: model.icon,
      actionUrl: model.actionUrl,
      isRead: model.isRead,
      readAt: model.readAt,
      clickedAt: model.clickedAt,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }

  async findManyByTenantAndUser(tenantId: string, userId: string, limit: number = 20): Promise<TenantNotificationEntity[]> {
    const models = await this.prisma.tenantNotification.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return models.map(this.mapToEntity);
  }

  async findById(tenantId: string, id: string): Promise<TenantNotificationEntity | null> {
    const model = await this.prisma.tenantNotification.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });
    if (!model) return null;
    return this.mapToEntity(model);
  }

  async findByIdGlobal(id: string): Promise<TenantNotificationEntity | null> {
    const model = await this.prisma.tenantNotification.findFirst({
      where: { id },
    });
    if (!model) return null;
    return this.mapToEntity(model);
  }

  async create(data: Omit<TenantNotificationEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<TenantNotificationEntity> {
    const model = await this.prisma.tenantNotification.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        templateId: data.templateId,
        title: data.title,
        body: data.body,
        icon: data.icon,
        actionUrl: data.actionUrl,
        isRead: data.isRead,
        readAt: data.readAt,
        clickedAt: data.clickedAt,
      },
    });
    return this.mapToEntity(model);
  }

  async markAsRead(tenantId: string, id: string): Promise<void> {
    await this.prisma.tenantNotification.update({
      where: { tenantId_id: { tenantId, id } },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markAsClicked(tenantId: string, id: string): Promise<void> {
    await this.prisma.tenantNotification.update({
      where: { tenantId_id: { tenantId, id } },
      data: {
        clickedAt: new Date(),
      },
    });
  }
}
