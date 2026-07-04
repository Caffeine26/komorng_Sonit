import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CreateCategoryUseCase } from '../../../../domains/catalog/application/use-cases/category/create-category.use-case';
import { ListCategoriesUseCase } from '../../../../domains/catalog/application/use-cases/category/list-categories.use-case';
import { UpdateCategoryUseCase } from '../../../../domains/catalog/application/use-cases/category/update-category.use-case';
import { DeleteCategoryUseCase } from '../../../../domains/catalog/application/use-cases/category/delete-category.use-case';
import { ReorderCategoriesUseCase } from '../../../../domains/catalog/application/use-cases/category/reorder-categories.use-case';

import { 
    AdminCreateCategorySchema, 
    AdminCreateCategoryInput, 
    AdminUpdateCategorySchema, 
    AdminUpdateCategoryInput,
} from '@xfos/contracts-bff-admin';
import { ZodValidationPipe } from '../../../../shared/nestjs/pipes/zod-validation.pipe';
import { CurrentTenant } from '../../../../shared/nestjs/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../../shared/guards/tenant-auth.guard';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('admin/menu/categories')
export class AdminCategoryController {
    constructor(
        private readonly createCategoryUseCase: CreateCategoryUseCase,
        private readonly listCategoriesUseCase: ListCategoriesUseCase,
        private readonly updateCategoryUseCase: UpdateCategoryUseCase,
        private readonly deleteCategoryUseCase: DeleteCategoryUseCase,
        private readonly reorderCategoriesUseCase: ReorderCategoriesUseCase,
    ) { }

    @Post()
    async createCategory(
        @CurrentTenant('id') tenantId: string,
        @Body(new ZodValidationPipe(AdminCreateCategorySchema)) input: AdminCreateCategoryInput,
    ) {
        const category = await this.createCategoryUseCase.execute(tenantId, input);
        return category.props;
    }

    @Get()
    async listCategories(@CurrentTenant('id') tenantId: string) {
        const categories = await this.listCategoriesUseCase.execute(tenantId);
        return categories.map(c => c.props);
    }

    @Put(':id')
    async updateCategory(
        @CurrentTenant('id') tenantId: string,
        @Param('id') id: string,
        @Body(new ZodValidationPipe(AdminUpdateCategorySchema)) input: AdminUpdateCategoryInput,
    ) {
        const category = await this.updateCategoryUseCase.execute(tenantId, id, input);
        return category.props;
    }

    @Delete(':id')
    async deleteCategory(
        @CurrentTenant('id') tenantId: string,
        @Param('id') id: string,
    ) {
        await this.deleteCategoryUseCase.execute(tenantId, id);
        return { success: true };
    }

    @Post('reorder')
    async reorderCategories(
        @CurrentTenant('id') tenantId: string,
        @Body() items: { id: string, sortOrder: number }[],
    ) {
        await this.reorderCategoriesUseCase.execute(tenantId, items);
        return { success: true };
    }
}
