import { NotFoundError } from '../../../../shared/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../core/ports/tenant.repository.port';
import { TenantSettings } from '@xfos/contracts-tenant';

@Injectable()
export class UpdateTenantSettingsUseCase {
  constructor(
    @Inject(TENANT_REPOSITORY_PORT)
    private readonly tenantRepo: ITenantRepository,
  ) {}

  /**
   * Updates the settings for a specific Tenant.
   * This is the "Brain" of the settings update process.
   */
  async execute(tenantId: string, settings: any): Promise<void> {
    // 1. Fetch the Entity
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError(`Tenant with ID ${tenantId} not found.`);
    }

    // 2. Perform the update (Business Logic in Entity)
    
    // Update Root Profile
    tenant.updateProfile({
      nameEn: settings.nameEn || settings.name,
      nameKm: settings.nameKm,
      codePrefix: settings.codePrefix,
      slug: settings.slug,
      serviceModel: settings.serviceModel,
    });

    // Update Operational Settings with deep-merge logic
    const currentSettings = tenant.settings || ({} as TenantSettings);
    
    const socialLinks = {
      ...(currentSettings.socialLinks || {}),
      ...(settings.socialLinks || {})
    };

    if (settings.phone !== undefined) socialLinks.phone = settings.phone;
    if (settings.facebookUrl !== undefined) socialLinks.facebook = settings.facebookUrl;

    const address = {
      ...(currentSettings.address || {}),
      ...(settings.address || {})
    };

    const newSettings: TenantSettings = {
      ...currentSettings,
      ...settings,
      socialLinks,
      address,
      primaryColor: settings.primaryColor ?? currentSettings.primaryColor ?? '#E07B39',
      defaultLocale: settings.defaultLocale ?? currentSettings.defaultLocale ?? 'km',
      currency: settings.currency ?? currentSettings.currency ?? 'USD',
      timezone: settings.timezone ?? currentSettings.timezone ?? 'Asia/Phnom_Penh',
      taxRateBps: settings.taxRateBps ?? currentSettings.taxRateBps ?? 0,
      taxInclusive: settings.taxInclusive ?? currentSettings.taxInclusive ?? true,
      autoAcceptOrders: settings.autoAcceptOrders ?? currentSettings.autoAcceptOrders ?? true,
      paymentTiming: settings.paymentTiming ?? currentSettings.paymentTiming ?? 'PAY_BEFORE',
    };

    tenant.setSettings(newSettings);

    if (settings.operatingHours) {
      tenant.setOperatingHours(settings.operatingHours);
    }

    if (settings.paymentMethods) {
      tenant.setPaymentMethods(settings.paymentMethods);
    }

    // 3. Persist the changes
    await this.tenantRepo.save(tenant);
  }
}
