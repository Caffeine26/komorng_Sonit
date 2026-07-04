import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';

@Injectable()
export class DeleteImageUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, menuItemId: string, imageId: string): Promise<void> {
    const item = await this.itemRepository.findById(tenantId, menuItemId);
    if (!item) {
      throw new NotFoundError(`Menu item ${menuItemId} not found`);
    }

    item.removeImage(imageId);
    await this.itemRepository.save(item);
  }
}
