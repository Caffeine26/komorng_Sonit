import { Injectable, Inject } from '@nestjs/common';
import { CATEGORY_REPOSITORY, ICategoryRepository } from '../../../core/ports/category.repository.port';
import { MenuCategory } from '../../../core/entities/menu-category.entity';

@Injectable()
export class ListCategoriesUseCase {
    constructor(
        @Inject(CATEGORY_REPOSITORY)
        private readonly categoryRepository: ICategoryRepository,
    ) { }

    async execute(tenantId: string): Promise<MenuCategory[]> {

        return this.categoryRepository.findMany(tenantId);
    }
}
