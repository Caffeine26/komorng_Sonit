import { Module } from '@nestjs/common';
import { PlatformAdminController } from './api/platform-admin.controller';
import { ListTenantsUseCase } from './application/use-cases/list-tenants.use-case';
import { TenantModule } from '../../domains/tenant/tenant.module';
import { PlatformCreateTenantUseCase } from './application/use-cases/platform-create-tenant.use-case';

@Module({
  imports: [TenantModule],
  controllers: [PlatformAdminController],
  providers: [ListTenantsUseCase, PlatformCreateTenantUseCase],
})
export class PlatformAdminModule {}
