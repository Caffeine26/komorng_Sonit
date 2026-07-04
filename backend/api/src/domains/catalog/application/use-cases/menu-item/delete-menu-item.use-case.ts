import { NotFoundError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';

@Injectable()
export class DeleteMenuItemUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, id: string): Promise<void> {
    const existingItem = await this.itemRepository.findById(tenantId, id);
    if (!existingItem) {
      throw new NotFoundError(`Menu Item ${id} not found`);
    }

    await this.itemRepository.delete(tenantId, id);
  }
}
