import { Controller, Patch, Get, Body, Headers, UseGuards, Req } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { UpdateStorefrontProfileUseCase } from '../../../domains/tenant/application/use-cases/update-storefront-profile.use-case';
import { GetStorefrontProfileUseCase } from '../../../domains/tenant/application/use-cases/get-storefront-profile.use-case';
import { updateStorefrontProfileRequestSchema, UpdateStorefrontProfileRequest, GetStorefrontProfileResponse } from '@xfos/contracts-bff-storefront';

@Controller('storefront/profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly updateProfileUseCase: UpdateStorefrontProfileUseCase,
    private readonly getProfileUseCase: GetStorefrontProfileUseCase,
  ) {}

  @Get()
  async getProfile(
    @Req() req: any,
  ): Promise<GetStorefrontProfileResponse> {
    const tenantId = req.user.tenantId;
    const userId = req.user.sub || req.user.id;

    const profile = await this.getProfileUseCase.execute({ tenantId, userId });

    return {
      phoneNumber: profile.phoneNumber,
      dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString() : null,
    };
  }

  @Patch()
  async updateProfile(
    @Headers('x-tenant-slug') tenantSlug: string,
    @Req() req: any,
    @Body() body: UpdateStorefrontProfileRequest,
  ) {
    const parsed = updateStorefrontProfileRequestSchema.parse(body);
    const tenantId = req.user.tenantId;
    const userId = req.user.sub || req.user.id;

    const dobDate = parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : null;
    const finalDob = dobDate && !isNaN(dobDate.getTime()) ? dobDate : null;

    await this.updateProfileUseCase.execute({
      tenantId,
      userId,
      phoneNumber: parsed.phoneNumber || null,
      dateOfBirth: finalDob,
    });

    return { success: true };
  }
}
