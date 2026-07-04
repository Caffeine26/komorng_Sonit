import { Body, Controller, Post, UseInterceptors, UploadedFile, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RegisterTenantUseCase } from '../../../domains/tenant/application/use-cases/register-tenant.use-case';

import { RegisterTenantRequest, RegisterTenantResponse, RegisterTenantSchema } from '@xfos/contracts-bff-admin';
import { ZodValidationPipe } from '../../../shared/nestjs/pipes/zod-validation.pipe';
import { Public } from '../../../shared/guards/public.decorator';

@Controller('admin/tenants')
export class AdminOnboardingController {
  constructor(
    private readonly registerUseCase: RegisterTenantUseCase,
  ) {}

  @Public()
  @Post('register')
  @UseInterceptors(FileInterceptor('document'))
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(RegisterTenantSchema)) body: RegisterTenantRequest,
    @Req() req: any,
    @UploadedFile() file?: any,
  ): Promise<RegisterTenantResponse> {
    const userId = req.user?.sub || '';
    
    console.log(`[AdminOnboardingController] Registering store: ${body.storeNameEn} for userId: ${userId || 'GUEST'}`);
    
    if (file) {
      console.log(`[AdminOnboardingController] Received document: ${file.originalname}`);
    }
    
    try {
      const result = await this.registerUseCase.execute(body, userId); 
      return result;
    } catch (error: any) {
      console.error('[AdminOnboardingController] Registration failed:', error);
      throw error;
    }
  }
}
