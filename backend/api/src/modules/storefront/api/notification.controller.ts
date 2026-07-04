import { Controller, Get, Patch, Param, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { GetTenantNotificationsUseCase } from '../../../domains/notification/application/use-cases/get-tenant-notifications.use-case';
import { MarkNotificationReadUseCase } from '../../../domains/notification/application/use-cases/mark-notification-read.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { GetNotificationsResponseDto } from '@xfos/contracts-bff-storefront';
import { TenantNotificationEntity } from '../../../domains/notification/core/entities/tenant-notification.entity';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Controller('storefront/:tenantSlug/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private readonly getTenantNotificationsUseCase: GetTenantNotificationsUseCase,
    private readonly markNotificationReadUseCase: MarkNotificationReadUseCase,
    private readonly prisma: PrismaService,
  ) {}

  private mapToDto(entity: TenantNotificationEntity) {
    return {
      id: entity.id,
      title: entity.title,
      body: entity.body,
      icon: entity.icon,
      actionUrl: entity.actionUrl,
      isRead: entity.isRead,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private async resolveTenantId(tenantSlug: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new NotFoundException(`Tenant "${tenantSlug}" not found`);
    return tenant.id;
  }

  @Get()
  async getNotifications(
    @Param('tenantSlug') tenantSlug: string,
    @Request() req: any,
  ): Promise<GetNotificationsResponseDto> {
    const tenantId = await this.resolveTenantId(tenantSlug);
    const userId = req.user?.sub || req.user?.userId;

    const entities = await this.getTenantNotificationsUseCase.execute({ tenantId, userId });

    return {
      notifications: entities.map(this.mapToDto),
    };
  }

  @Patch(':id/read')
  async markRead(
    @Param('tenantSlug') tenantSlug: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);

    await this.markNotificationReadUseCase.execute({
      tenantId,
      notificationId: id,
    });

    return { success: true };
  }
}
