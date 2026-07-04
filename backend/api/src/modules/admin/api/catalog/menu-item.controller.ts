import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CreateMenuItemUseCase } from '../../../../domains/catalog/application/use-cases/menu-item/create-menu-item.use-case';
import { UpdateMenuItemUseCase } from '../../../../domains/catalog/application/use-cases/menu-item/update-menu-item.use-case';
import { ListMenuItemsUseCase } from '../../../../domains/catalog/application/use-cases/menu-item/list-menu-items.use-case';
import { DeleteMenuItemUseCase } from '../../../../domains/catalog/application/use-cases/menu-item/delete-menu-item.use-case';
import { ReorderMenuItemsUseCase } from '../../../../domains/catalog/application/use-cases/menu-item/reorder-menu-items.use-case';
import { BulkDeleteMenuItemsUseCase } from '../../../../domains/catalog/application/use-cases/menu-item/bulk-delete-menu-items.use-case';
import { GetMenuItemUseCase } from '../../../../domains/catalog/application/use-cases/menu-item/get-menu-item.use-case';

import { 
    AdminCreateMenuItemSchema,
    AdminCreateMenuItemInput,
    AdminUpdateMenuItemSchema,
    AdminUpdateMenuItemInput
} from '@xfos/contracts-bff-admin';
import { ZodValidationPipe } from '../../../../shared/nestjs/pipes/zod-validation.pipe';
import { CurrentTenant } from '../../../../shared/nestjs/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../../shared/guards/tenant-auth.guard';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('admin/menu/categories/:categoryId/items')
export class AdminMenuItemController {
    constructor(
        private readonly createMenuItemUseCase: CreateMenuItemUseCase,
        private readonly updateMenuItemUseCase: UpdateMenuItemUseCase,
        private readonly listMenuItemsUseCase: ListMenuItemsUseCase,
        private readonly deleteMenuItemUseCase: DeleteMenuItemUseCase,
        private readonly reorderMenuItemsUseCase: ReorderMenuItemsUseCase,
        private readonly bulkDeleteMenuItemsUseCase: BulkDeleteMenuItemsUseCase,
        private readonly getMenuItemUseCase: GetMenuItemUseCase,
    ) { }

    @Post()
    async createItem(
        @CurrentTenant('id') tenantId: string,
        @Param('categoryId') categoryId: string,
        @Body(new ZodValidationPipe(AdminCreateMenuItemSchema)) input: AdminCreateMenuItemInput,
    ) {
        // Enforce categoryId from URL
        const item = await this.createMenuItemUseCase.execute(tenantId, { ...input, categoryId });
        return item.toSnapshot();
    }

    @Get()
    async listItems(
        @CurrentTenant('id') tenantId: string,
        @Param('categoryId') categoryId: string,
    ) {
        const catId = categoryId === 'all' ? undefined : categoryId;
        const items = await this.listMenuItemsUseCase.execute(tenantId, catId);
        return items.map(item => item.toSnapshot());
    }

    @Get(':id')
    async getItem(
        @CurrentTenant('id') tenantId: string,
        @Param('id') id: string,
    ) {
        const item = await this.getMenuItemUseCase.execute(tenantId, id);
        return item.toSnapshot();
    }

    @Put(':id')
    async updateItem(
        @CurrentTenant('id') tenantId: string,
        @Param('id') id: string,
        @Body(new ZodValidationPipe(AdminUpdateMenuItemSchema)) input: AdminUpdateMenuItemInput,
    ) {
        const item = await this.updateMenuItemUseCase.execute(tenantId, id, input);
        return item.toSnapshot();
    }

    @Delete(':id')
    async deleteItem(
        @CurrentTenant('id') tenantId: string,
        @Param('id') id: string,
    ) {
        await this.deleteMenuItemUseCase.execute(tenantId, id);
        return { success: true };
    }

    @Post('reorder')
    async reorderItems(
        @CurrentTenant('id') tenantId: string,
        @Body() items: { id: string, sortOrder: number }[],
    ) {
        await this.reorderMenuItemsUseCase.execute(tenantId, items);
        return { success: true };
    }

    @Post('bulk-delete')
    async bulkDeleteItem(
        @CurrentTenant('id') tenantId: string,
        @Body('ids') ids: string[],
    ) {
        return await this.bulkDeleteMenuItemsUseCase.execute(tenantId, ids);
    }
}
