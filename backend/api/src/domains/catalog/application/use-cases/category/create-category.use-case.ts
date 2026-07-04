import { Injectable, Inject } from '@nestjs/common';
import { CATEGORY_REPOSITORY, ICategoryRepository } from '../../../core/ports/category.repository.port';
import { MenuCategory } from '../../../core/entities/menu-category.entity';
import { AdminCreateCategoryInput } from '@xfos/contracts-bff-admin';

@Injectable()
export class CreateCategoryUseCase {
    constructor(
        @Inject(CATEGORY_REPOSITORY)
        private readonly categoryRepository: ICategoryRepository,
    ) { }

    async execute(tenantId: string, input: AdminCreateCategoryInput): Promise<MenuCategory> {
        // 1. Generate a new unique ID
        // Note: XFOS standard is to use 'cat_' prefix for categories
        const id = `cat_${Math.random().toString(36).substring(2, 12)}`;

        // 2. Create the Domain Entity
        // This runs all our business validation (Step 2)
        const category = MenuCategory.create(tenantId, id, {
            nameKm: input.nameKm,
            nameEn: input.nameEn,
            sortOrder: input.sortOrder,
            isActive: input.isActive,
            icon: input.icon,
            urlBanner: input.urlBanner,
        });

        // 3. Save to Database via the Port (Step 3/4)
        await this.categoryRepository.save(category);

        return category;
    }
}
