import { TenantCustomer as PrismaTenantCustomer } from '@xfos/database';
import { TenantCustomerEntity } from '../../core/entities/tenant-customer.entity';

export class TenantCustomerMapper {
  /**
   * Converts a Prisma database record to a Domain Entity.
   */
  static toDomain(raw: PrismaTenantCustomer & { user?: { fullName: string | null; avatarUrl: string | null; phone?: string | null; authProviders?: Array<{ displayName: string | null }> } | null }): TenantCustomerEntity {
    const telegramUsername = raw.user?.authProviders?.[0]?.displayName ?? null;
    const phone = (raw.user as any)?.phone ?? null;
    
    let displayFullName = raw.user?.fullName ?? null;
    if (!displayFullName && phone) {
      let formattedPhone = phone;
      if (formattedPhone.startsWith('+855')) formattedPhone = '0' + formattedPhone.slice(4);
      else if (formattedPhone.startsWith('855')) formattedPhone = '0' + formattedPhone.slice(3);
      displayFullName = formattedPhone;
    }
    
    return TenantCustomerEntity.rehydrate({
      tenantId: raw.tenantId,
      id: raw.id,
      userId: raw.userId,
      isVip: raw.isVip,
      totalSpentCents: raw.totalSpentCents,
      totalOrders: raw.totalOrders,
      loyaltyPoints: raw.loyaltyPoints,
      customerSegment: raw.customerSegment,
      lastVisitAt: raw.lastVisitAt,
      internalNotes: raw.internalNotes,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      fullName: displayFullName,
      avatarUrl: raw.user?.avatarUrl ?? null,
      telegramUsername,
      dateOfBirth: raw.dateOfBirth,
      phone,
    });
  }

  /**
   * Converts a Domain Entity to a Prisma-compatible object for persistence.
   */
  static toPersistence(domain: TenantCustomerEntity) {
    return {
      tenantId: domain.tenantId,
      id: domain.id,
      userId: domain.userId,
      isVip: domain.isVip,
      totalSpentCents: domain.totalSpentCents,
      totalOrders: domain.totalOrders,
      loyaltyPoints: domain.loyaltyPoints,
      customerSegment: domain.customerSegment,
      lastVisitAt: domain.lastVisitAt,
      internalNotes: domain.internalNotes,
      dateOfBirth: domain.dateOfBirth,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    };
  }
}
