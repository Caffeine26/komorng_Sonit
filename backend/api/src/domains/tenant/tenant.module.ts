import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TENANT_REPOSITORY_PORT } from './core/ports/tenant.repository.port';
import { PrismaTenantRepository } from './infra/repositories/prisma-tenant.repository';
import { TEAM_REPOSITORY_PORT } from './core/ports/team.repository.port';
import { PrismaTeamRepository } from './infra/repositories/prisma-team.repository';
import { TENANT_CUSTOMER_REPOSITORY_PORT } from './core/ports/tenant-customer.repository.port';
import { PrismaTenantCustomerRepository } from './infra/repositories/prisma-tenant-customer.repository';
import { CreateTenantUseCase } from './application/use-cases/create-tenant.use-case';
import { RegisterTenantUseCase } from './application/use-cases/register-tenant.use-case';
import { UpdateTenantSettingsUseCase } from './application/use-cases/update-tenant-settings.use-case';
import { GetTenantSettingsUseCase } from './application/use-cases/get-tenant-settings.use-case';
import { UpdateStorefrontProfileUseCase } from './application/use-cases/update-storefront-profile.use-case';
import { GetStorefrontProfileUseCase } from './application/use-cases/get-storefront-profile.use-case';
import { AuthModule } from '../../modules/auth/auth.module';

@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [
    PrismaService,
    {
      provide: TENANT_REPOSITORY_PORT,
      useClass: PrismaTenantRepository,
    },
    {
      provide: TEAM_REPOSITORY_PORT,
      useClass: PrismaTeamRepository,
    },
    {
      provide: TENANT_CUSTOMER_REPOSITORY_PORT,
      useClass: PrismaTenantCustomerRepository,
    },
    CreateTenantUseCase,
    RegisterTenantUseCase,
    UpdateTenantSettingsUseCase,
    GetTenantSettingsUseCase,
    UpdateStorefrontProfileUseCase,
    GetStorefrontProfileUseCase,
  ],
  exports: [
    CreateTenantUseCase,
    RegisterTenantUseCase,
    UpdateTenantSettingsUseCase,
    GetTenantSettingsUseCase,
    UpdateStorefrontProfileUseCase,
    GetStorefrontProfileUseCase,
    TENANT_REPOSITORY_PORT,
    TEAM_REPOSITORY_PORT,
    TENANT_CUSTOMER_REPOSITORY_PORT,
  ],
})
export class TenantModule {}
