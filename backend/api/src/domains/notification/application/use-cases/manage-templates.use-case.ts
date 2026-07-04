import { Injectable, Inject } from '@nestjs/common';
import { TemplateNotFoundError } from '../../core/errors/notification.errors';
import { INotificationTemplateRepository, NOTIFICATION_TEMPLATE_REPOSITORY_PORT } from '../../core/ports/notification-template.repository.port';
import { NotificationTemplateEntity } from '../../core/entities/notification-template.entity';

export interface CreateTemplateInput {
  tenantId: string;
  name: string;
  title: string;
  body: string;
  icon?: string | null;
  buttonText?: string | null;
  actionUrl?: string | null;
}

export interface UpdateTemplateInput extends Partial<CreateTemplateInput> {
  tenantId: string;
  id: string;
}

@Injectable()
export class ManageTemplatesUseCase {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY_PORT)
    private readonly templateRepository: INotificationTemplateRepository,
  ) {}

  async list(tenantId: string): Promise<NotificationTemplateEntity[]> {
    return this.templateRepository.findManyByTenant(tenantId);
  }

  async get(tenantId: string, id: string): Promise<NotificationTemplateEntity> {
    const template = await this.templateRepository.findById(tenantId, id);
    if (!template) {
      throw new TemplateNotFoundError(id);
    }
    return template;
  }

  async create(input: CreateTemplateInput): Promise<NotificationTemplateEntity> {
    return this.templateRepository.create(input);
  }

  async update(input: UpdateTemplateInput): Promise<NotificationTemplateEntity> {
    await this.get(input.tenantId, input.id); // verify exists
    
    const { id, tenantId, ...data } = input;
    return this.templateRepository.update(tenantId, id, data);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.get(tenantId, id); // verify exists
    return this.templateRepository.delete(tenantId, id);
  }
}
