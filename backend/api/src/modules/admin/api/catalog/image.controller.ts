import { Controller, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CreateImageUseCase } from '../../../../domains/catalog/application/use-cases/image/create-image.use-case';
import { UpdateImageUseCase } from '../../../../domains/catalog/application/use-cases/image/update-image.use-case';
import { DeleteImageUseCase } from '../../../../domains/catalog/application/use-cases/image/delete-image.use-case';

import { 
    AdminCreateMenuItemImageSchema,
    AdminCreateMenuItemImageInput,
    AdminUpdateMenuItemImageSchema,
    AdminUpdateMenuItemImageInput
} from '@xfos/contracts-bff-admin';
import { ZodValidationPipe } from '../../../../shared/nestjs/pipes/zod-validation.pipe';
import { CurrentTenant } from '../../../../shared/nestjs/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../../shared/guards/tenant-auth.guard';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('admin/menu/items/:menuItemId/images')
export class AdminImageController {
    constructor(
        private readonly createImageUseCase: CreateImageUseCase,
        private readonly updateImageUseCase: UpdateImageUseCase,
        private readonly deleteImageUseCase: DeleteImageUseCase,
    ) { }

    @Post()
    async createImage(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Body(new ZodValidationPipe(AdminCreateMenuItemImageSchema)) input: AdminCreateMenuItemImageInput,
    ) {
        return await this.createImageUseCase.execute(tenantId, menuItemId, input);
    }

    @Put(':imageId')
    async updateImage(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Param('imageId') imageId: string,
        @Body(new ZodValidationPipe(AdminUpdateMenuItemImageSchema)) input: AdminUpdateMenuItemImageInput,
    ) {
        return await this.updateImageUseCase.execute(tenantId, menuItemId, imageId, input);
    }

    @Delete(':imageId')
    async deleteImage(
        @CurrentTenant('id') tenantId: string,
        @Param('menuItemId') menuItemId: string,
        @Param('imageId') imageId: string,
    ) {
        await this.deleteImageUseCase.execute(tenantId, menuItemId, imageId);
        return { success: true };
    }
}
