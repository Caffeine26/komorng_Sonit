import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';

export interface ReorderItem {
  id: string;
  sortOrder: number;
}

@Injectable()
export class ReorderMenuItemsUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, items: ReorderItem[]): Promise<void> {
    for (const item of items) {
      const menuItem = await this.itemRepository.findById(tenantId, item.id);
      if (menuItem) {
        menuItem.update({ sortOrder: item.sortOrder });
        await this.itemRepository.save(menuItem);
      }
    }
  }
}
