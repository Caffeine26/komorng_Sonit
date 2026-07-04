import { Controller, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CreateVariantUseCase } from '../../../../domains/catalog/application/use-cases/variant/create-variant.use-case';
import { UpdateVariantUseCase } from '../../../../domains/catalog/application/use-cases/variant/update-variant.use-case';
import { DeleteVariantUseCase } from '../../../../domains/catalog/application/use-cases/variant/delete-variant.use-case';

import { 
    AdminCreateMenuItemVariantSchema,
    AdminCreateMenuItemVariantInput,
    AdminUpdateMenuItemVariantSchema,
    AdminUpdateMenuItemVariantInput
} from '@xfos/contracts-bff-admin';
import { ZodValidationPipe } from '../../../../shared/nestjs/pipes/zod-validation.pipe';
import { CurrentTenant } from '../../../../shared/nestjs/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../../shared/guards/tenant-auth.guard';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('admin/menu/items/:menuItemId/variants')
export class AdminVariantController {
    constructor(
        private readonly createVariantUseCase: CreateVariantUseCase,
        private readonly updateVariantUseCase: UpdateVariantUseCase,
        private readonly deleteVariantUseCase: DeleteVariantUseCase,
    ) { }

    @Post()
    async createVariant(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Body(new ZodValidationPipe(AdminCreateMenuItemVariantSchema)) input: AdminCreateMenuItemVariantInput,
    ) {
        return await this.createVariantUseCase.execute(tenantId, menuItemId, input);
    }

    @Put(':variantId')
    async updateVariant(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Param('variantId') variantId: string,
        @Body(new ZodValidationPipe(AdminUpdateMenuItemVariantSchema)) input: AdminUpdateMenuItemVariantInput,
    ) {
        return await this.updateVariantUseCase.execute(tenantId, menuItemId, variantId, input);
    }

    @Delete(':variantId')
    async deleteVariant(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Param('variantId') variantId: string,
    ) {
        await this.deleteVariantUseCase.execute(tenantId, menuItemId, variantId);
        return { success: true };
    }
}
