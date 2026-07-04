import { NotFoundError, ValidationError } from '../../../../../shared/errors/domain-error';
import { Injectable, Inject } from '@nestjs/common';
import { CATEGORY_REPOSITORY, ICategoryRepository } from '../../../core/ports/category.repository.port';
import { MENU_ITEM_REPOSITORY_PORT, IMenuItemRepository } from '../../../core/ports/menu-item.repository.port';

@Injectable()
export class DeleteCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
    @Inject(MENU_ITEM_REPOSITORY_PORT)
    private readonly itemRepository: IMenuItemRepository,
  ) {}

  async execute(tenantId: string, id: string): Promise<void> {
    const existingCategory = await this.categoryRepository.findById(tenantId, id);
    if (!existingCategory) {
      throw new NotFoundError(`Category ${id} not found`);
    }

    // Check if category has items
    const items = await this.itemRepository.findByCategory(tenantId, id);
    if (items.length > 0) {
      throw new ValidationError(`Cannot delete category ${id} because it contains ${items.length} items. Please move or delete the items first.`);
    }

    await this.categoryRepository.delete(tenantId, id);
  }
}
