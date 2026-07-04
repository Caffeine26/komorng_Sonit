import { Module } from '@nestjs/common';
import { AdminController } from './api/admin.controller';
import { AdminCategoryController } from './api/catalog/category.controller';
import { AdminMenuItemController } from './api/catalog/menu-item.controller';
import { AdminMediaController } from './api/catalog/media.controller';
import { AdminVariantController } from './api/catalog/variant.controller';
import { AdminOptionGroupController } from './api/catalog/option-group.controller';
import { AdminOptionController } from './api/catalog/option.controller';
import { AdminImageController } from './api/catalog/image.controller';
import { TeamController } from './api/team.controller';
import { TableController } from './api/table/table.controller';
import { AdminCartController } from './api/cart.controller';
import { AdminOrderController } from './api/order.controller';
import { CustomerController } from './api/customer.controller';
import { MarketingController } from './api/marketing.controller';
import { AdminAuthController } from './api/auth.controller';
import { AdminOnboardingController } from './api/onboarding.controller';
import { CatalogModule } from '../../domains/catalog/catalog.module';
import { GetMenuOverviewUseCase } from './application/use-cases/get-menu-overview.use-case';
import { TenantModule } from '../../domains/tenant/tenant.module';
import { AdminUpdateSettingsUseCase } from './application/use-cases/admin-update-settings.use-case';
import { AdminGetSettingsUseCase } from './application/use-cases/admin-get-settings.use-case';
import { CreateAdminSessionUseCase } from './application/use-cases/create-admin-session.use-case';
import { TenantAuthGuard } from '../../shared/guards/tenant-auth.guard';
import { S3StorageService } from '../../shared/infra/storage/s3-storage.service';

import { ListTeamMembersUseCase } from '../../domains/tenant/application/use-cases/team/list-team-members.use-case';
import { InviteTeamMemberUseCase } from '../../domains/tenant/application/use-cases/team/invite-team-member.use-case';
import { UpdateTeamMemberUseCase } from '../../domains/tenant/application/use-cases/team/update-team-member.use-case';
import { RemoveTeamMemberUseCase } from '../../domains/tenant/application/use-cases/team/remove-team-member.use-case';
import { RevokeInvitationUseCase } from '../../domains/tenant/application/use-cases/team/revoke-invitation.use-case';
import { GetTenantCustomersUseCase } from '../../domains/tenant/application/use-cases/get-tenant-customers.use-case';
import { RegisterTenantUseCase } from '../../domains/tenant/application/use-cases/register-tenant.use-case';

import { AuthModule } from '../auth/auth.module';
import { TableModule } from '../../domains/table/table.module';
import { CartModule } from '../../domains/cart/cart.module';
import { OrderModule } from '../../domains/order/order.module';
import { NotificationModule } from '../../domains/notification/notification.module';

@Module({
  imports: [
    TenantModule,
    CatalogModule,
    AuthModule,
    TableModule,
    CartModule,
    OrderModule,
    NotificationModule,
  ],
  controllers: [
    AdminController,
    AdminCategoryController,
    AdminMenuItemController,
    AdminMediaController,
    AdminVariantController,
    AdminOptionGroupController,
    AdminOptionController,
    AdminImageController,
    TeamController,
    TableController,
    AdminCartController,
    AdminOrderController,
    CustomerController,
    MarketingController,
    AdminAuthController,
    AdminOnboardingController,
  ],
  providers: [
    GetMenuOverviewUseCase,
    AdminUpdateSettingsUseCase,
    AdminGetSettingsUseCase,
    CreateAdminSessionUseCase,
    TenantAuthGuard,
    S3StorageService,
    ListTeamMembersUseCase,
    InviteTeamMemberUseCase,
    UpdateTeamMemberUseCase,
    RemoveTeamMemberUseCase,
    RevokeInvitationUseCase,
    GetTenantCustomersUseCase,
    RegisterTenantUseCase,
  ],
})
export class AdminModule { }
