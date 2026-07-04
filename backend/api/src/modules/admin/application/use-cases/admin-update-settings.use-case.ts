import { Injectable, Logger } from '@nestjs/common';
import { UpdateTenantSettingsUseCase } from '../../../../domains/tenant/application/use-cases/update-tenant-settings.use-case';
import { UpdateTenantSettingsRequest } from '@xfos/contracts-bff-admin';
import { S3StorageService } from '../../../../shared/infra/storage/s3-storage.service';

@Injectable()
export class AdminUpdateSettingsUseCase {
  private readonly logger = new Logger(AdminUpdateSettingsUseCase.name);

  constructor(
    private readonly domainUseCase: UpdateTenantSettingsUseCase,
    private readonly s3Service: S3StorageService,
  ) { }

  /**
   * Merchant-facing settings update.
   */
  async execute(tenantId: string, request: UpdateTenantSettingsRequest): Promise<void> {
    this.logger.log(`[Admin] Updating settings for tenant: ${tenantId}`);
    this.logger.log(`[Admin] Request Body: ${JSON.stringify(request, null, 2)}`);

    // Handle base64 logo upload to S3 if needed
    if (request.logoUrl && request.logoUrl.startsWith('data:image/')) {
      try {
        const matches = request.logoUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const contentType = matches[1];
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');

          const extension = contentType.split('/')[1] || 'png';
          const file: any = {
            buffer,
            originalname: `logo.${extension}`,
            mimetype: contentType,
            size: buffer.length
          };

          const uploadResult = await this.s3Service.upload(file, 'tenant-logos');
          request.logoUrl = uploadResult;
          this.logger.log(`[Admin] Uploaded base64 logo to S3 successfully: ${uploadResult}`);
        }
      } catch (err) {
        this.logger.error(`[Admin] Failed to upload base64 logo to S3, falling back to base64 string directly:`, err);
      }
    }

    // Call the domain logic
    await this.domainUseCase.execute(tenantId, request);

    this.logger.log(`[Admin] Settings updated successfully for tenant: ${tenantId}`);
  }
}
