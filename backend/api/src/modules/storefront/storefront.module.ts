import { Module } from '@nestjs/common';

import { CatalogModule } from '../../domains/catalog/catalog.module';
import { TenantModule } from '../../domains/tenant/tenant.module';
import { CartModule } from '../../domains/cart/cart.module';
import { OrderModule } from '../../domains/order/order.module';
import { AuthModule } from '../auth/auth.module';
import { StorefrontController } from './api/storefront.controller';
import { StorefrontCartController } from './api/cart.controller';
import { StorefrontOrderController } from './api/order.controller';
import { StorefrontAuthController } from './api/auth.controller';
import { GetStorefrontContextUseCase } from './application/use-cases/get-storefront-context.use-case';
import { ResolveQrSessionUseCase } from './application/use-cases/resolve-qr-session.use-case';
import { TelegramLoginBffUseCase } from './application/use-cases/telegram-login.bff-use-case';
import { QrSessionGuard } from '../../shared/guards/qr-session.guard';
import { NotificationModule } from '../../domains/notification/notification.module';
import { NotificationController } from './api/notification.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { ProfileController } from './api/profile.controller';
import { TelegramWebhookController } from './api/telegram-webhook.controller';

@Module({
  imports: [
    CatalogModule,
    TenantModule,
    CartModule,
    OrderModule,
    AuthModule,
    NotificationModule,
    PrismaModule,
  ],
  controllers: [
    StorefrontController,
    StorefrontCartController,
    StorefrontOrderController,
    StorefrontAuthController,
    NotificationController,
    ProfileController,
    TelegramWebhookController,
  ],
  providers: [
    GetStorefrontContextUseCase,
    ResolveQrSessionUseCase,
    TelegramLoginBffUseCase,
    QrSessionGuard,
  ],
})
export class StorefrontModule {}
