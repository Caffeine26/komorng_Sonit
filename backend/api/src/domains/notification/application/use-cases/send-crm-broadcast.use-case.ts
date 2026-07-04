import { Injectable, Inject } from '@nestjs/common';
import { TemplateNotFoundError } from '../../core/errors/notification.errors';
import { INotificationTemplateRepository, NOTIFICATION_TEMPLATE_REPOSITORY_PORT } from '../../core/ports/notification-template.repository.port';
import { ITenantNotificationRepository, TENANT_NOTIFICATION_REPOSITORY_PORT } from '../../core/ports/tenant-notification.repository.port';
import { ITelegramNotificationService, TELEGRAM_NOTIFICATION_SERVICE } from '../../core/ports/telegram-notification.service.port';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface SendCrmBroadcastInput {
  tenantId: string;
  templateId: string;
  customerIds: string[]; // IDs from tenant_customers
}

@Injectable()
export class SendCrmBroadcastUseCase {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY_PORT)
    private readonly templateRepository: INotificationTemplateRepository,
    @Inject(TENANT_NOTIFICATION_REPOSITORY_PORT)
    private readonly notificationRepository: ITenantNotificationRepository,
    @Inject(TELEGRAM_NOTIFICATION_SERVICE)
    private readonly telegramService: ITelegramNotificationService,
    private readonly prisma: PrismaService, // Needed to resolve customerIds to userIds and telegramIds
  ) {}

  async execute(input: SendCrmBroadcastInput): Promise<void> {
    const template = await this.templateRepository.findById(input.tenantId, input.templateId);
    if (!template) {
      throw new TemplateNotFoundError(input.templateId);
    }

    // Resolve customer IDs to user IDs and their associated Telegram Provider ID
    const customers = await this.prisma.tenantCustomer.findMany({
      where: {
        tenantId: input.tenantId,
        id: { in: input.customerIds },
      },
      include: {
        user: {
          include: {
            authProviders: {
              where: { provider: 'TELEGRAM' },
            },
          },
        },
      },
    });

    for (const customer of customers) {
      // 1. Create in-app Storefront notification
      const notification = await this.notificationRepository.create({
        tenantId: input.tenantId,
        userId: customer.userId,
        templateId: template.id,
        title: template.title,
        body: template.body,
        icon: template.icon,
        actionUrl: template.actionUrl,
        isRead: false,
      });

      // 2. Send Telegram Push notification (if they have connected Telegram)
      const telegramProvider = customer.user.authProviders[0];
      if (telegramProvider && telegramProvider.providerId) {
        let telegramBody = `*${template.title}*\n\n${template.body}`;
        
        const inline_keyboard = [];
        if (template.actionUrl) {
           const isUrl = template.actionUrl.startsWith('http://') || template.actionUrl.startsWith('https://');
           
           if (isUrl) {
             inline_keyboard.push([{
               text: template.buttonText || 'Open Link',
               url: template.actionUrl,
             }]);
           } else {
             inline_keyboard.push([{
               text: template.buttonText || 'Claim Code',
               callback_data: `promo_click:${notification.id}`,
             }]);
           }
        }

        try {
          await this.telegramService.sendDirectMessage(
            telegramProvider.providerId,
            telegramBody,
            { inline_keyboard }
          );
        } catch (e) {
          // Log but don't fail the whole broadcast if one message fails
          console.error(`Failed to send Telegram broadcast to ${telegramProvider.providerId}`, e);
        }
      }
    }
  }
}
