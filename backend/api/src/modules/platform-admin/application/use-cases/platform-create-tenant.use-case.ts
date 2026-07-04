import { Injectable, Logger } from '@nestjs/common';
import { CreateTenantUseCase } from '../../../../domains/tenant/application/use-cases/create-tenant.use-case';
import { CreateTenantRequest, CreateTenantResponse } from '@xfos/contracts-bff-platform-admin';

@Injectable()
export class PlatformCreateTenantUseCase {
  private readonly logger = new Logger(PlatformCreateTenantUseCase.name);

  constructor(
    private readonly createTenantUseCase: CreateTenantUseCase,
  ) {}

  /**
   * Platform-Admin wrapper for Tenant creation.
   * Handles orchestration, logging, and cross-domain events.
   */
  async execute(request: CreateTenantRequest): Promise<CreateTenantResponse> {
    this.logger.log(`[Platform-Admin] Initiating creation of tenant: ${request.slug}`);
    
    // Delegate to the pure domain use case
    const result = await this.createTenantUseCase.execute(request);

    this.logger.log(`[Platform-Admin] Tenant "${request.slug}" successfully created with ID: ${result.id}`);

    return result;
  }
}
