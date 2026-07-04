import { ConflictError } from '../../../../shared/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../core/ports/tenant.repository.port';
import { Tenant } from '../../core/entities/tenant.entity';
import { RegisterTenantRequest, RegisterTenantResponse } from '@xfos/contracts-bff-admin';
import { TenantStatusEnum, ServiceModelEnum } from '@xfos/contracts-enums';
import { randomUUID } from 'crypto';

@Injectable()
export class RegisterTenantUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY_PORT)
    private readonly tenantRepo: ITenantRepository,
  ) { }

  /**
   * Orchestrates the public registration of a new Tenant.
   * This is the entry point for new merchants.
   */
  async execute(request: RegisterTenantRequest, ownerId: string): Promise<RegisterTenantResponse> {
    // 1. Guard: Slug Uniqueness
    const existing = await this.tenantRepo.findBySlug(request.slug);
    if (existing) {
      throw new ConflictError(`Store URL slug "${request.slug}" is already taken.`);
    }

    // 2. Guard: One Owner, One Shop (Telegram account uniqueness)
    if (ownerId) {
      const alreadyOwns = await this.tenantRepo.existsByOwnerId(ownerId);
      if (alreadyOwns) {
        throw new ConflictError('You already have a registered store. Each Telegram account can only own one store.');
      }
    }

    // 2. Build Domain Entity
    const tenant = new Tenant({
      id: randomUUID(),
      slug: request.slug,
      nameEn: request.storeNameEn,
      nameKm: request.storeNameKm,
      codePrefix: request.slug.substring(0, 3).toUpperCase(),
      status: TenantStatusEnum.Enum.DRAFT,
      serviceModel: ServiceModelEnum.Enum.STALL_KIOSK,
    });

    // 3. Initialize Settings with registration data
    tenant.initializeDefaultSettings(request.description);

    // 4. Persist via Port
    await this.tenantRepo.save(tenant);

    // 5. Link Owner (Only if provided)
    if (ownerId) {
      await this.tenantRepo.assignOwner(tenant.id, ownerId);
    }

    // 6. Return success
    return {
      success: true,
      tenantId: tenant.id,
      message: 'Registration successful. Your store is now under review.',
    };
  }
}
