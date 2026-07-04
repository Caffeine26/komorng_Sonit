export class NotificationTemplateEntity {
  id: string;
  tenantId: string;
  
  name: string;
  title: string;
  body: string;
  icon?: string | null;
  buttonText?: string | null;
  actionUrl?: string | null;
  
  createdAt: Date;
  updatedAt: Date;

  constructor(props: Partial<NotificationTemplateEntity>) {
    Object.assign(this, props);
  }
}
