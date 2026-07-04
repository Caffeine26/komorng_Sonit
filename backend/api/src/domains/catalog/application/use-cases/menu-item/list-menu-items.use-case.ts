import { Injectable, Inject } from '@nestjs/common';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';
import { MenuItem } from '../../../core/entities/menu-item.entity';

@Injectable()
export class ListMenuItemsUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, categoryId?: string): Promise<MenuItem[]> {
    if (categoryId) {
      return this.itemRepository.findByCategory(tenantId, categoryId);
    }
    const allItems = await this.itemRepository.findAll(tenantId);
    return allItems.filter(item => item.categoryId != null);
  }
}
