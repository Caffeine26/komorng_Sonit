export class TenantNotificationEntity {
  id: string;
  tenantId: string;
  userId: string;
  templateId?: string | null;
  
  title: string;
  body: string;
  icon?: string | null;
  actionUrl?: string | null;
  
  isRead: boolean;
  readAt?: Date | null;
  clickedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;

  constructor(props: Partial<TenantNotificationEntity>) {
    Object.assign(this, props);
  }
}
