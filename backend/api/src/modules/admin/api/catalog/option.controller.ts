import { Controller, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CreateOptionUseCase } from '../../../../domains/catalog/application/use-cases/option/create-option.use-case';
import { UpdateOptionUseCase } from '../../../../domains/catalog/application/use-cases/option/update-option.use-case';
import { DeleteOptionUseCase } from '../../../../domains/catalog/application/use-cases/option/delete-option.use-case';

import { 
    AdminCreateMenuItemOptionSchema,
    AdminCreateMenuItemOptionInput,
    AdminUpdateMenuItemOptionSchema,
    AdminUpdateMenuItemOptionInput
} from '@xfos/contracts-bff-admin';
import { ZodValidationPipe } from '../../../../shared/nestjs/pipes/zod-validation.pipe';
import { CurrentTenant } from '../../../../shared/nestjs/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../../shared/guards/tenant-auth.guard';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('admin/menu/items/:menuItemId/option-groups/:groupId/options')
export class AdminOptionController {
    constructor(
        private readonly createOptionUseCase: CreateOptionUseCase,
        private readonly updateOptionUseCase: UpdateOptionUseCase,
        private readonly deleteOptionUseCase: DeleteOptionUseCase,
    ) { }

    @Post()
    async createOption(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Param('groupId') groupId: string,
        @Body(new ZodValidationPipe(AdminCreateMenuItemOptionSchema)) input: AdminCreateMenuItemOptionInput,
    ) {
        return await this.createOptionUseCase.execute(tenantId, menuItemId, groupId, input);
    }

    @Put(':optionId')
    async updateOption(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Param('groupId') groupId: string,
        @Param('optionId') optionId: string,
        @Body(new ZodValidationPipe(AdminUpdateMenuItemOptionSchema)) input: AdminUpdateMenuItemOptionInput,
    ) {
        return await this.updateOptionUseCase.execute(tenantId, menuItemId, groupId, optionId, input);
    }

    @Delete(':optionId')
    async deleteOption(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Param('groupId') groupId: string,
        @Param('optionId') optionId: string,
    ) {
        await this.deleteOptionUseCase.execute(tenantId, menuItemId, groupId, optionId);
        return { success: true };
    }
}
