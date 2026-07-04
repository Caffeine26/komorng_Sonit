import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { ORDER_REPOSITORY_PORT } from './core/ports/order.repository.port';
import { ORDER_EVENT_PUBLISHER_PORT } from './core/ports/order-event-publisher.port';
import { ORDER_SESSION_REPOSITORY_PORT } from './core/ports/order-session.repository.port';
import { OrderRepositoryImpl } from './infra/repositories/prisma-order.repository';
import { PrismaOrderSessionRepository } from './infra/repositories/prisma-order-session.repository';
import { NoOpOrderEventPublisher } from './infra/publishers/no-op-order-event-publisher';
import { PDF_GENERATOR_SERVICE } from './core/ports/pdf-generator.service.port';
import { PuppeteerPdfService } from './infra/services/puppeteer-pdf.service';

// Use cases (with @Injectable — NestJS can auto-resolve)
import { SubmitOrderStorefrontUseCase } from './application/use-cases/submit-order-storefront.use-case';
import { UpdateOrderStatusUseCase } from './application/use-cases/update-order-status.use-case';
import { AddItemToSessionUseCase } from './application/use-cases/add-item-to-session.use-case';
import { AcknowledgeNewItemsUseCase } from './application/use-cases/acknowledge-new-items.use-case';
import { GetCustomerOrderHistoryUseCase } from './application/use-cases/get-customer-order-history.use-case';
import { GetOrderPdfUseCase } from './application/use-cases/get-order-pdf.use-case';

// Use cases (pure TS — need factory providers)
import { SubmitOrderAdminUseCase } from './application/use-cases/submit-order-admin.use-case';
import { LinkTelegramGuestToOrderUseCase } from './application/use-cases/link-telegram-guest-to-order.use-case';
import { GetOrdersUseCase } from './application/use-cases/get-orders.use-case';
import { GetOrderStatusUseCase } from './application/use-cases/get-order-status.use-case';

import { TenantModule } from '../tenant/tenant.module';
import { TENANT_REPOSITORY_PORT } from '../tenant/core/ports/tenant.repository.port';
import { GetTenantSettingsUseCase } from '../tenant/application/use-cases/get-tenant-settings.use-case';

const ports = [
  {
    provide: ORDER_REPOSITORY_PORT,
    useClass: OrderRepositoryImpl,
  },
  {
    provide: ORDER_EVENT_PUBLISHER_PORT,
    useClass: NoOpOrderEventPublisher,
  },
  {
    provide: ORDER_SESSION_REPOSITORY_PORT,
    useClass: PrismaOrderSessionRepository,
  },
  {
    provide: PDF_GENERATOR_SERVICE,
    useClass: PuppeteerPdfService,
  }
];

// Use cases that still have @Injectable/@Inject decorators
const decoratedUseCases = [
  SubmitOrderStorefrontUseCase,
  UpdateOrderStatusUseCase,
  AddItemToSessionUseCase,
  AcknowledgeNewItemsUseCase,
  GetCustomerOrderHistoryUseCase,
  GetOrderPdfUseCase,
  LinkTelegramGuestToOrderUseCase,
];

// Factory providers for pure-TS use cases (no @Injectable)
const pureUseCaseFactories = [
  {
    provide: GetOrdersUseCase,
    useFactory: (orderRepo: any) => new GetOrdersUseCase(orderRepo),
    inject: [ORDER_REPOSITORY_PORT],
  },
  {
    provide: GetOrderStatusUseCase,
    useFactory: (orderRepo: any, tenantRepo: any, getTenantSettings: GetTenantSettingsUseCase) =>
      new GetOrderStatusUseCase(orderRepo, tenantRepo, getTenantSettings),
    inject: [ORDER_REPOSITORY_PORT, TENANT_REPOSITORY_PORT, GetTenantSettingsUseCase],
  },
  {
    provide: SubmitOrderAdminUseCase,
    useFactory: (orderRepo: any, eventPublisher: any, sessionRepo: any) =>
      new SubmitOrderAdminUseCase(orderRepo, eventPublisher, sessionRepo),
    inject: [ORDER_REPOSITORY_PORT, ORDER_EVENT_PUBLISHER_PORT, ORDER_SESSION_REPOSITORY_PORT],
  },
];

import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, TenantModule, forwardRef(() => NotificationModule), forwardRef(() => AuthModule)],
  providers: [
    ...ports,
    ...decoratedUseCases,
    ...pureUseCaseFactories,
  ],
  exports: [...ports, ...decoratedUseCases, ...pureUseCaseFactories],
})
export class OrderModule {}
