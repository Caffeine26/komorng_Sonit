import { Module } from '@nestjs/common';
import { NOTIFICATION_REPOSITORY_PORT } from './core/ports/notification.repository.port';
import { PrismaNotificationRepository } from './infra/repositories/prisma-notification.repository';
import { TELEGRAM_NOTIFICATION_SERVICE } from './core/ports/telegram-notification.service.port';
import { TelegramBotAdapter } from './infra/telegram/telegram-bot.adapter';
import { forwardRef } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { OrderModule } from '../order/order.module';
import { SendOrderNotificationUseCase } from './application/use-cases/send-order-notification.use-case';
import { SendDirectMessageUseCase } from './application/use-cases/send-direct-message.use-case';
import { SendOrderSubmittedNotificationUseCase } from './application/use-cases/send-order-submitted-notification.use-case';
import { SendOrderInvoiceUseCase } from './application/use-cases/send-order-invoice.use-case';
import { GetTenantNotificationsUseCase } from './application/use-cases/get-tenant-notifications.use-case';
import { MarkNotificationReadUseCase } from './application/use-cases/mark-notification-read.use-case';
import { MarkNotificationClickedUseCase } from './application/use-cases/mark-notification-clicked.use-case';
import { ManageTemplatesUseCase } from './application/use-cases/manage-templates.use-case';
import { SendCrmBroadcastUseCase } from './application/use-cases/send-crm-broadcast.use-case';
import { GetMarketingInsightsUseCase } from './application/use-cases/get-marketing-insights.use-case';
import { TENANT_NOTIFICATION_REPOSITORY_PORT } from './core/ports/tenant-notification.repository.port';
import { PrismaTenantNotificationRepository } from './infra/repositories/prisma-tenant-notification.repository';
import { NOTIFICATION_TEMPLATE_REPOSITORY_PORT } from './core/ports/notification-template.repository.port';
import { PrismaNotificationTemplateRepository } from './infra/repositories/prisma-notification-template.repository';
import { TenantModule } from '../tenant/tenant.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [
    TenantModule, 
    PrismaModule,
    forwardRef(() => AuthModule),
    forwardRef(() => OrderModule)
  ],
  providers: [
    {
      provide: NOTIFICATION_REPOSITORY_PORT,
      useClass: PrismaNotificationRepository,
    },
    {
      provide: TELEGRAM_NOTIFICATION_SERVICE,
      useClass: TelegramBotAdapter,
    },
    {
      provide: TENANT_NOTIFICATION_REPOSITORY_PORT,
      useClass: PrismaTenantNotificationRepository,
    },
    {
      provide: NOTIFICATION_TEMPLATE_REPOSITORY_PORT,
      useClass: PrismaNotificationTemplateRepository,
    },
    SendOrderNotificationUseCase,
    SendDirectMessageUseCase,
    SendOrderSubmittedNotificationUseCase,
    SendOrderInvoiceUseCase,
    GetTenantNotificationsUseCase,
    MarkNotificationReadUseCase,
    MarkNotificationClickedUseCase,
    ManageTemplatesUseCase,
    SendCrmBroadcastUseCase,
    GetMarketingInsightsUseCase,
  ],
  exports: [
    SendOrderNotificationUseCase,
    SendDirectMessageUseCase,
    SendOrderSubmittedNotificationUseCase,
    SendOrderInvoiceUseCase,
    GetTenantNotificationsUseCase,
    MarkNotificationReadUseCase,
    MarkNotificationClickedUseCase,
    ManageTemplatesUseCase,
    SendCrmBroadcastUseCase,
    GetMarketingInsightsUseCase,
    TELEGRAM_NOTIFICATION_SERVICE,
    NOTIFICATION_REPOSITORY_PORT,
    TENANT_NOTIFICATION_REPOSITORY_PORT,
    NOTIFICATION_TEMPLATE_REPOSITORY_PORT,
  ],
})
export class NotificationModule {}
