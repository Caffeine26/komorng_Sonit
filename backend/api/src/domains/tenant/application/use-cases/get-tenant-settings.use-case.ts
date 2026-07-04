import { NotFoundError } from '../../../../shared/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../core/ports/tenant.repository.port';
import { Tenant } from '../../core/entities/tenant.entity';

@Injectable()
export class GetTenantSettingsUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY_PORT)
    private readonly tenantRepo: ITenantRepository,
  ) {}

  /**
   * Fetches the complete Tenant profile and settings.
   */
  async execute(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError(`Merchant with ID ${tenantId} not found.`);
    }
    return tenant;
  }
}
