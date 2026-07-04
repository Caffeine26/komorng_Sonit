import { ConflictError } from '../../../../shared/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../core/ports/tenant.repository.port';
import { Tenant } from '../../core/entities/tenant.entity';
import { CreateTenantRequest, CreateTenantResponse } from '@xfos/contracts-bff-platform-admin';
import { TenantStatusEnum } from '@xfos/contracts-enums';
import { randomUUID } from 'crypto';

@Injectable()
export class CreateTenantUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY_PORT)
    private readonly tenantRepo: ITenantRepository,
  ) {}

  /**
   * Orchestrates the creation of a new Tenant.
   */
  async execute(request: CreateTenantRequest): Promise<CreateTenantResponse> {
    // 1. Guard: Slug Uniqueness
    const existing = await this.tenantRepo.findBySlug(request.slug);
    if (existing) {
      throw new ConflictError(`Merchant slug "${request.slug}" is already taken.`);
    }

    // 2. Build Domain Entity
    const tenant = new Tenant({
      id: randomUUID(),
      slug: request.slug,
      nameEn: request.nameEn || request.name,
      nameKm: request.nameKm,
      codePrefix: request.codePrefix || request.slug.substring(0, 3).toUpperCase(),
      status: TenantStatusEnum.Enum.DRAFT,
      serviceModel: request.serviceModel as any,
    });

    // 3. Persist via Port
    await this.tenantRepo.save(tenant);

    // 4. Return shared contract response
    return {
      id: tenant.id,
      slug: tenant.slug,
    };
  }
}
