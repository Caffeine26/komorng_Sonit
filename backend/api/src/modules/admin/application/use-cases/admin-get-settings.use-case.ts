import { Inject, Injectable, Logger } from '@nestjs/common';
import { GetTenantSettingsUseCase } from '../../../../domains/tenant/application/use-cases/get-tenant-settings.use-case';
import { Tenant } from '@xfos/contracts-tenant';
import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../../../domains/auth/core/ports/user.repository.port';

@Injectable()
export class AdminGetSettingsUseCase {
  private readonly logger = new Logger(AdminGetSettingsUseCase.name);

  constructor(
    private readonly getTenantSettingsUseCase: GetTenantSettingsUseCase,
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
  ) {}

  /**
   * Orchestrates the retrieval of merchant settings and current user info.
   */
  async execute(tenantId: string, userId: string): Promise<Tenant & { currentUser: any }> {
    this.logger.log(`Fetching settings for tenant: ${tenantId} for user: ${userId}`);
    
    const [tenant, user] = await Promise.all([
        this.getTenantSettingsUseCase.execute(tenantId),
        this.userRepo.findById(userId)
    ]);
    
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.nameEn,
      nameEn: tenant.nameEn,
      nameKm: tenant.nameKm || "",
      codePrefix: tenant.codePrefix,
      status: tenant.status as any,
      serviceModel: tenant.serviceModel as any,
      settings: tenant.settings,
      operatingHours: tenant.operatingHours,
      paymentMethods: tenant.paymentMethods,
      currentUser: {
        id: user?.id,
        fullName: user?.fullName,
        email: user?.email,
        roles: user?.roleNames || [],
        avatarUrl: user?.avatarUrl || null,
      }
    } as any;
  }
}
