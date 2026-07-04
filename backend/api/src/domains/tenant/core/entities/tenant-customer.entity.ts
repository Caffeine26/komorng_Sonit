/**
 * TenantCustomer aggregate. Pure TypeScript — no NestJS, no Prisma.
 * Represents a customer profile linked to a specific tenant.
 */
export class TenantCustomerEntity {
  public constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly userId: string,
    public readonly isVip: boolean,
    public readonly totalSpentCents: number,
    public readonly totalOrders: number,
    public readonly loyaltyPoints: number,
    public readonly customerSegment: string | null,
    public readonly lastVisitAt: Date | null,
    public readonly internalNotes: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly fullName?: string | null,
    public readonly avatarUrl?: string | null,
    public readonly telegramUsername?: string | null,
    public dateOfBirth?: Date | null,
    public readonly phone?: string | null,
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.tenantId) throw new Error('TenantCustomer must have a tenantId');
    if (!this.id) throw new Error('TenantCustomer must have an id');
    if (!this.userId) throw new Error('TenantCustomer must have a userId');
    if (this.totalSpentCents < 0) throw new Error('totalSpentCents cannot be negative');
    if (this.totalOrders < 0) throw new Error('totalOrders cannot be negative');
    if (this.loyaltyPoints < 0) throw new Error('loyaltyPoints cannot be negative');
  }

  static create(props: {
    tenantId: string;
    id: string;
    userId: string;
    fullName?: string | null;
    avatarUrl?: string | null;
    telegramUsername?: string | null;
    dateOfBirth?: Date | null;
    phone?: string | null;
  }): TenantCustomerEntity {
    return new TenantCustomerEntity(
      props.tenantId,
      props.id,
      props.userId,
      false, // isVip
      0, // totalSpentCents
      0, // totalOrders
      0, // loyaltyPoints
      null, // customerSegment
      null, // lastVisitAt
      null, // internalNotes
      new Date(),
      new Date(),
      props.fullName,
      props.avatarUrl,
      props.telegramUsername,
      props.dateOfBirth,
      props.phone,
    );
  }

  static rehydrate(props: {
    tenantId: string;
    id: string;
    userId: string;
    isVip: boolean;
    totalSpentCents: number;
    totalOrders: number;
    loyaltyPoints: number;
    customerSegment: string | null;
    lastVisitAt: Date | null;
    internalNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
    fullName?: string | null;
    avatarUrl?: string | null;
    telegramUsername?: string | null;
    dateOfBirth?: Date | null;
    phone?: string | null;
  }): TenantCustomerEntity {
    return new TenantCustomerEntity(
      props.tenantId,
      props.id,
      props.userId,
      props.isVip,
      props.totalSpentCents,
      props.totalOrders,
      props.loyaltyPoints,
      props.customerSegment,
      props.lastVisitAt,
      props.internalNotes,
      props.createdAt,
      props.updatedAt,
      props.fullName,
      props.avatarUrl,
      props.telegramUsername,
      props.dateOfBirth,
      props.phone,
    );
  }
}
