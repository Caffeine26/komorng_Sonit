import { NotFoundError } from '../../../../shared/errors/domain-error';

export class NotificationNotFoundError extends NotFoundError {
  constructor(notificationId: string) {
    super(`Notification with ID ${notificationId} not found`);
    this.name = 'NotificationNotFoundError';
  }
}

export class TemplateNotFoundError extends NotFoundError {
  constructor(templateId: string) {
    super(`Template ${templateId} not found`);
    this.name = 'TemplateNotFoundError';
  }
}

export class CustomerNotFoundError extends NotFoundError {
  constructor(customerId: string) {
    super(`Customer ${customerId} not found`);
    this.name = 'CustomerNotFoundError';
  }
}
