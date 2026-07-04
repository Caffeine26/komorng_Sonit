import { Module } from '@nestjs/common';
import { CATEGORY_REPOSITORY } from './core/ports/category.repository.port';
import { MENU_ITEM_REPOSITORY_PORT } from './core/ports/menu-item.repository.port';
import { PrismaCategoryRepository } from './infra/repositories/prisma-category.repository';
import { PrismaMenuItemRepository } from './infra/repositories/prisma-menu-item.repository';

// Category Use Cases
import { CreateCategoryUseCase } from './application/use-cases/category/create-category.use-case';
import { ListCategoriesUseCase } from './application/use-cases/category/list-categories.use-case';
import { UpdateCategoryUseCase } from './application/use-cases/category/update-category.use-case';
import { DeleteCategoryUseCase } from './application/use-cases/category/delete-category.use-case';
import { ReorderCategoriesUseCase } from './application/use-cases/category/reorder-categories.use-case';

// MenuItem Use Cases
import { CreateMenuItemUseCase } from './application/use-cases/menu-item/create-menu-item.use-case';
import { UpdateMenuItemUseCase } from './application/use-cases/menu-item/update-menu-item.use-case';
import { ListMenuItemsUseCase } from './application/use-cases/menu-item/list-menu-items.use-case';
import { DeleteMenuItemUseCase } from './application/use-cases/menu-item/delete-menu-item.use-case';
import { ReorderMenuItemsUseCase } from './application/use-cases/menu-item/reorder-menu-items.use-case';
import { BulkDeleteMenuItemsUseCase } from './application/use-cases/menu-item/bulk-delete-menu-items.use-case';
import { GetMenuItemUseCase } from './application/use-cases/menu-item/get-menu-item.use-case';

// Variant Use Cases
import { CreateVariantUseCase } from './application/use-cases/variant/create-variant.use-case';
import { UpdateVariantUseCase } from './application/use-cases/variant/update-variant.use-case';
import { DeleteVariantUseCase } from './application/use-cases/variant/delete-variant.use-case';

// Option Group Use Cases
import { CreateOptionGroupUseCase } from './application/use-cases/option-group/create-option-group.use-case';
import { UpdateOptionGroupUseCase } from './application/use-cases/option-group/update-option-group.use-case';
import { DeleteOptionGroupUseCase } from './application/use-cases/option-group/delete-option-group.use-case';

// Option Use Cases
import { CreateOptionUseCase } from './application/use-cases/option/create-option.use-case';
import { UpdateOptionUseCase } from './application/use-cases/option/update-option.use-case';
import { DeleteOptionUseCase } from './application/use-cases/option/delete-option.use-case';

// Image Use Cases
import { CreateImageUseCase } from './application/use-cases/image/create-image.use-case';
import { UpdateImageUseCase } from './application/use-cases/image/update-image.use-case';
import { DeleteImageUseCase } from './application/use-cases/image/delete-image.use-case';

@Module({
    providers: [
        // Category
        CreateCategoryUseCase,
        ListCategoriesUseCase,
        UpdateCategoryUseCase,
        DeleteCategoryUseCase,
        ReorderCategoriesUseCase,
        
        // MenuItem
        CreateMenuItemUseCase,
        UpdateMenuItemUseCase,
        ListMenuItemsUseCase,
        DeleteMenuItemUseCase,
        ReorderMenuItemsUseCase,
        BulkDeleteMenuItemsUseCase,
        GetMenuItemUseCase,

        // Variant
        CreateVariantUseCase,
        UpdateVariantUseCase,
        DeleteVariantUseCase,

        // Option Group
        CreateOptionGroupUseCase,
        UpdateOptionGroupUseCase,
        DeleteOptionGroupUseCase,

        // Option
        CreateOptionUseCase,
        UpdateOptionUseCase,
        DeleteOptionUseCase,

        // Image
        CreateImageUseCase,
        UpdateImageUseCase,
        DeleteImageUseCase,

        // Database Mapping
        {
            provide: CATEGORY_REPOSITORY,
            useClass: PrismaCategoryRepository,
        },
        {
            provide: MENU_ITEM_REPOSITORY_PORT,
            useClass: PrismaMenuItemRepository,
        },
    ],

    exports: [
        CreateCategoryUseCase,
        ListCategoriesUseCase,
        UpdateCategoryUseCase,
        DeleteCategoryUseCase,
        ReorderCategoriesUseCase,
        
        CreateMenuItemUseCase,
        UpdateMenuItemUseCase,
        ListMenuItemsUseCase,
        DeleteMenuItemUseCase,
        ReorderMenuItemsUseCase,
        BulkDeleteMenuItemsUseCase,
        GetMenuItemUseCase,

        CreateVariantUseCase,
        UpdateVariantUseCase,
        DeleteVariantUseCase,

        CreateOptionGroupUseCase,
        UpdateOptionGroupUseCase,
        DeleteOptionGroupUseCase,

        CreateOptionUseCase,
        UpdateOptionUseCase,
        DeleteOptionUseCase,

        CreateImageUseCase,
        UpdateImageUseCase,
        DeleteImageUseCase,

        CATEGORY_REPOSITORY,
        MENU_ITEM_REPOSITORY_PORT,
    ],
})
export class CatalogModule { }
