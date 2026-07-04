import { 
  Tenant as PrismaTenant, 
  TenantSettings as PrismaSettings,
  TenantOperatingHours as PrismaHours,
  TenantPaymentMethod as PrismaPayment
} from '@xfos/database';
import { Tenant } from '../../core/entities/tenant.entity';

export class TenantMapper {
  /**
   * Converts a Prisma database record to a Domain Entity.
   */
  static toDomain(raw: PrismaTenant & { 
    settings?: PrismaSettings | null,
    operatingHours?: PrismaHours[],
    paymentMethods?: PrismaPayment[]
  }): Tenant {
    return new Tenant({
      id: raw.id,
      slug: raw.slug,
      nameEn: raw.nameEn,
      nameKm: raw.nameKm,
      codePrefix: raw.codePrefix,
      status: raw.status as any,
      serviceModel: raw.settings?.serviceModel as any,
      settings: raw.settings ? {
        logoUrl: raw.settings.logoUrl ?? undefined,
        coverImageUrl: raw.settings.coverImageUrl ?? undefined,
        primaryColor: raw.settings.primaryColor ?? '#E07B39',
        defaultLocale: raw.settings.defaultLocale as any,
        currency: raw.settings.currency as any,
        timezone: raw.settings.timezone,
        taxRateBps: raw.settings.taxRateBps,
        taxInclusive: raw.settings.taxInclusive,
        autoAcceptOrders: raw.settings.autoAcceptOrders,
        paymentTiming: raw.settings.payTiming as any,
        facebookUrl: (raw.settings.socialLinks as any)?.facebook || undefined,
        phone: (raw.settings.socialLinks as any)?.phone || undefined,
        address: raw.settings.address as any,
        description: raw.settings.description as any,
        socialLinks: raw.settings.socialLinks as any,
      } : undefined,
      operatingHours: raw.operatingHours?.map(h => ({
        id: h.id,
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime.toISOString(),
        closeTime: h.closeTime.toISOString(),
        isClosed: h.isClosed,
      })),
      paymentMethods: raw.paymentMethods?.map(p => ({
        id: p.id,
        method: p.method,
        provider: p.provider,
        isEnabled: p.isEnabled,
        config: p.config,
      })),
    });
  }

  /**
   * Converts a Domain Entity to a Prisma-compatible object for persistence.
   */
  static toPersistence(domain: Tenant) {
    return {
      id: domain.id,
      slug: domain.slug,
      nameEn: domain.nameEn,
      nameKm: domain.nameKm,
      codePrefix: domain.codePrefix,
      status: domain.status,
      // Settings are handled separately in the repository via nested writes
    };
  }
}
