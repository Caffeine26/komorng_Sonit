import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../shared/guards/tenant-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/guards/roles.decorator';
import { ZodValidationPipe } from '../../../shared/nestjs/pipes/zod-validation.pipe';

import {
  addCartItemInputSchema,
  type AddCartItemInput,
  updateCartItemInputSchema,
  type UpdateCartItemInput,
} from '@xfos/contracts-bff-admin';

import { GetOrCreateCartUseCase } from '../../../domains/cart/application/use-cases/get-or-create-cart.use-case';
import { AddCartItemUseCase } from '../../../domains/cart/application/use-cases/add-cart-item.use-case';
import { UpdateCartItemUseCase } from '../../../domains/cart/application/use-cases/update-cart-item.use-case';
import { RemoveCartItemUseCase } from '../../../domains/cart/application/use-cases/remove-cart-item.use-case';

interface AuthenticatedRequest extends Request {
  user: { sub: string; roles: string[] };
  tenantId: string; // Injected by TenantAuthGuard
}

/**
 * Admin cart controller — used by the POS system (admin) to manage carts on behalf of customers
 * (e.g., walk-in orders, phone orders).
 */
@UseGuards(JwtAuthGuard, TenantAuthGuard, RolesGuard)
@Roles('TENANT_OWNER', 'TENANT_MANAGER', 'SERVICE_STAFF')
@Controller('admin/carts')
export class AdminCartController {
  constructor(
    private readonly getOrCreateCartUseCase: GetOrCreateCartUseCase,
    private readonly addCartItemUseCase: AddCartItemUseCase,
    private readonly updateCartItemUseCase: UpdateCartItemUseCase,
    private readonly removeCartItemUseCase: RemoveCartItemUseCase,
  ) {}

  @Get()
  async getCart(
    @Req() req: AuthenticatedRequest,
    @Query('sessionId') sessionId: string,
  ) {
    return this.getOrCreateCartUseCase.execute({
      tenantId: req.tenantId,
      sessionId,
      createIfMissing: false,
    });
  }

  @Post('items')
  async addItem(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(addCartItemInputSchema)) body: AddCartItemInput,
  ) {
    return this.addCartItemUseCase.execute({
      tenantId: req.tenantId,
      sessionId: body.sessionId,
      menuItemId: body.menuItemId,
      quantity: body.quantity,
      unitPriceCents: body.unitPriceCents,
      variantId: body.variantId ?? null,
      optionIds: body.optionIds ?? [],
      notes: body.notes ?? null,
    });
  }

  @Patch(':cartId/items/:cartItemId')
  async updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('cartId') cartId: string,
    @Param('cartItemId') cartItemId: string,
    @Body(new ZodValidationPipe(updateCartItemInputSchema)) body: UpdateCartItemInput,
  ) {
    return this.updateCartItemUseCase.execute({
      tenantId: req.tenantId,
      cartId,
      cartItemId,
      quantity: body.quantity,
    });
  }

  @Delete(':cartId/items/:cartItemId')
  async removeItem(
    @Req() req: AuthenticatedRequest,
    @Param('cartId') cartId: string,
    @Param('cartItemId') cartItemId: string,
  ) {
    return this.removeCartItemUseCase.execute({
      tenantId: req.tenantId,
      cartId,
      cartItemId,
    });
  }
}
