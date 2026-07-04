import { Injectable, Inject } from '@nestjs/common';
import { CATEGORY_REPOSITORY, ICategoryRepository } from '../../../core/ports/category.repository.port';

export interface ReorderItem {
  id: string;
  sortOrder: number;
}

@Injectable()
export class ReorderCategoriesUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
  ) {}

  async execute(tenantId: string, items: ReorderItem[]): Promise<void> {
    // We can iterate and update sort orders
    // In a production environment with many categories, we might use a bulk update
    for (const item of items) {
      const category = await this.categoryRepository.findById(tenantId, item.id);
      if (category) {
        category.update({ sortOrder: item.sortOrder });
        await this.categoryRepository.save(category);
      }
    }
  }
}
