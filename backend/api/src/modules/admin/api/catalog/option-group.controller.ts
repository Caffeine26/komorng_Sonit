import { Controller, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CreateOptionGroupUseCase } from '../../../../domains/catalog/application/use-cases/option-group/create-option-group.use-case';
import { UpdateOptionGroupUseCase } from '../../../../domains/catalog/application/use-cases/option-group/update-option-group.use-case';
import { DeleteOptionGroupUseCase } from '../../../../domains/catalog/application/use-cases/option-group/delete-option-group.use-case';

import { 
    AdminCreateMenuItemOptionGroupSchema,
    AdminCreateMenuItemOptionGroupInput,
    AdminUpdateMenuItemOptionGroupSchema,
    AdminUpdateMenuItemOptionGroupInput
} from '@xfos/contracts-bff-admin';
import { ZodValidationPipe } from '../../../../shared/nestjs/pipes/zod-validation.pipe';
import { CurrentTenant } from '../../../../shared/nestjs/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../../shared/guards/tenant-auth.guard';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('admin/menu/items/:menuItemId/option-groups')
export class AdminOptionGroupController {
    constructor(
        private readonly createOptionGroupUseCase: CreateOptionGroupUseCase,
        private readonly updateOptionGroupUseCase: UpdateOptionGroupUseCase,
        private readonly deleteOptionGroupUseCase: DeleteOptionGroupUseCase,
    ) { }

    @Post()
    async createOptionGroup(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Body(new ZodValidationPipe(AdminCreateMenuItemOptionGroupSchema)) input: AdminCreateMenuItemOptionGroupInput,
    ) {
        return await this.createOptionGroupUseCase.execute(tenantId, menuItemId, input);
    }

    @Put(':groupId')
    async updateOptionGroup(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Param('groupId') groupId: string,
        @Body(new ZodValidationPipe(AdminUpdateMenuItemOptionGroupSchema)) input: AdminUpdateMenuItemOptionGroupInput,
    ) {
        return await this.updateOptionGroupUseCase.execute(tenantId, menuItemId, groupId, input);
    }

    @Delete(':groupId')
    async deleteOptionGroup(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Param('groupId') groupId: string,
    ) {
        await this.deleteOptionGroupUseCase.execute(tenantId, menuItemId, groupId);
        return { success: true };
    }
}
