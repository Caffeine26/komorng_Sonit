import { Body, Controller, Get, Post, Inject, NotFoundException, Patch, Req, UseGuards } from '@nestjs/common';
import {
  type AdminMenuOverviewResponse,
  UpdateTenantSettingsSchema,
  type UpdateTenantSettingsRequest
} from '@xfos/contracts-bff-admin';
import { type Tenant } from '@xfos/contracts-tenant';
import { GetMenuOverviewUseCase } from '../application/use-cases/get-menu-overview.use-case';
import { AdminUpdateSettingsUseCase } from '../application/use-cases/admin-update-settings.use-case';
import { AdminGetSettingsUseCase } from '../application/use-cases/admin-get-settings.use-case';
import { CreateAdminSessionUseCase } from '../application/use-cases/create-admin-session.use-case';
import { ZodValidationPipe } from '../../../shared/nestjs/pipes/zod-validation.pipe';
import { Roles } from '@/shared/guards/roles.decorator';
import { TenantAuthGuard } from '@/shared/guards/tenant-auth.guard';
import { JwtAuthGuard } from '@/shared/guards/jwt-auth.guard';

/**
 * Merchant admin BFF controller. Mounted at `/api/v1/admin/*`. The merchant
 * portal frontend is the only consumer.
 */
@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly getMenuOverviewUseCase: GetMenuOverviewUseCase,
    private readonly updateSettingsUseCase: AdminUpdateSettingsUseCase,
    private readonly getSettingsUseCase: AdminGetSettingsUseCase,
    private readonly createAdminSessionUseCase: CreateAdminSessionUseCase,
  ) { }

  @Get('menu')
  async menu(): Promise<AdminMenuOverviewResponse> {
    return this.getMenuOverviewUseCase.execute();
  }

  @Get('settings')
  async getSettings(@Req() req: any): Promise<Tenant & { currentUser: any }> {
    const tenantId = req.tenantId; // Set by TenantAuthGuard
    const userId = req.user.sub;
    return this.getSettingsUseCase.execute(tenantId, userId) as any;
  }

  @Patch('settings')
  async updateSettings(
    @Req() req: any,
    @Body(new ZodValidationPipe(UpdateTenantSettingsSchema)) body: UpdateTenantSettingsRequest,
  ): Promise<{ success: true }> {
    const tenantId = req.tenantId; // Set by TenantAuthGuard
    await this.updateSettingsUseCase.execute(tenantId, body);
    return { success: true };
  }

  @Post('sessions')
  async createSession(
    @Req() req: any
  ): Promise<{ sessionId: string }> {
    return this.createAdminSessionUseCase.execute({
      tenantId: req.tenantId
    });
  }
}
