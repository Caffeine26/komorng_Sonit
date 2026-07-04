import { Body, Controller, Get, Post, Query, UsePipes } from '@nestjs/common';
import {
  ListTenantsRequestSchema,
  type ListTenantsRequest,
  type ListTenantsResponse,
  CreateTenantSchema,
  type CreateTenantRequest,
  type CreateTenantResponse,
} from '@xfos/contracts-bff-platform-admin';
import { ZodValidationPipe } from '../../../shared/nestjs/pipes/zod-validation.pipe';
import { ListTenantsUseCase } from '../application/use-cases/list-tenants.use-case';
import { PlatformCreateTenantUseCase } from '../application/use-cases/platform-create-tenant.use-case';

/**
 * Platform-admin BFF controller. Mounted at `/api/v1/platform-admin/*`.
 * The internal-ops frontend is the only consumer.
 */
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(
    private readonly listTenantsUseCase: ListTenantsUseCase,
    private readonly createTenantUseCase: PlatformCreateTenantUseCase,
  ) {}

  @Get('tenants')
  async listTenants(
    @Query(new ZodValidationPipe(ListTenantsRequestSchema)) query: ListTenantsRequest,
  ): Promise<ListTenantsResponse> {
    return this.listTenantsUseCase.execute(query);
  }

  @Post('tenants')
  async createTenant(
    @Body(new ZodValidationPipe(CreateTenantSchema)) body: CreateTenantRequest,
  ): Promise<{ data: CreateTenantResponse }> {
    const result = await this.createTenantUseCase.execute(body);
    return { data: result };
  }
}
