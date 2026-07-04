import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../shared/guards/public.decorator';
import { QrSessionGuard } from '../../../shared/guards/qr-session.guard';
import { ZodValidationPipe } from '../../../shared/nestjs/pipes/zod-validation.pipe';
import {
  addCartItemInputSchema,
  type AddCartItemInput,
  updateCartItemInputSchema,
  type UpdateCartItemInput,
} from '@xfos/contracts-bff-storefront';

import { GetOrCreateCartUseCase } from '../../../domains/cart/application/use-cases/get-or-create-cart.use-case';
import { AddCartItemUseCase } from '../../../domains/cart/application/use-cases/add-cart-item.use-case';
import { UpdateCartItemUseCase } from '../../../domains/cart/application/use-cases/update-cart-item.use-case';
import { RemoveCartItemUseCase } from '../../../domains/cart/application/use-cases/remove-cart-item.use-case';

type QrRequest = Request & {
  tenantId: string;
  sessionId: string;
};

/**
 * Storefront cart controller — anonymous customer-facing cart endpoints.
 *
 * Auth: @Public() skips the global JwtAuthGuard.
 *       @UseGuards(QrSessionGuard) validates the ?qr=TOKEN query param,
 *       resolves tenantId + sessionId, and attaches them to request.
 *
 * Routes:
 *   GET    /storefront/cart?qr=TOKEN          → get cart (no DB write if empty)
 *   POST   /storefront/cart/items?qr=TOKEN    → add item (creates cart on first add)
 *   PATCH  /storefront/cart/items/:id?qr=TOKEN → update item quantity
 *   DELETE /storefront/cart/items/:id?qr=TOKEN → remove item
 */
@Public()
@UseGuards(QrSessionGuard)
@Controller('storefront/cart')
export class StorefrontCartController {
  constructor(
    private readonly getOrCreateCartUseCase: GetOrCreateCartUseCase,
    private readonly addCartItemUseCase: AddCartItemUseCase,
    private readonly updateCartItemUseCase: UpdateCartItemUseCase,
    private readonly removeCartItemUseCase: RemoveCartItemUseCase,
  ) {}

  /**
   * GET /storefront/cart?qr=TOKEN
   * Returns the cart if it exists, or an empty cart shape. No DB write.
   */
  @Get()
  async getCart(@Req() request: QrRequest) {
    return this.getOrCreateCartUseCase.execute({
      tenantId: request.tenantId,
      sessionId: request.sessionId,
      createIfMissing: false,
    });
  }

  /**
   * POST /storefront/cart/items?qr=TOKEN
   * Adds an item to the cart. Creates cart in DB on first item added.
   */
  @Post('items')
  async addItem(
    @Req() request: QrRequest,
    @Body(new ZodValidationPipe(addCartItemInputSchema)) body: AddCartItemInput,
  ) {
    return this.addCartItemUseCase.execute({
      tenantId: request.tenantId,
      sessionId: request.sessionId,
      menuItemId: body.menuItemId,
      quantity: body.quantity,
      unitPriceCents: body.unitPriceCents,
      variantId: body.variantId ?? null,
      optionIds: body.optionIds ?? [],
      notes: body.notes ?? null,
    });
  }

  /**
   * PATCH /storefront/cart/items/:cartItemId?qr=TOKEN
   * Updates quantity of an existing cart item.
   */
  @Patch('items/:cartItemId')
  async updateItem(
    @Req() request: QrRequest,
    @Param('cartItemId') cartItemId: string,
    @Body(new ZodValidationPipe(updateCartItemInputSchema)) body: UpdateCartItemInput,
  ) {
    const cart = await this.getOrCreateCartUseCase.execute({
      tenantId: request.tenantId,
      sessionId: request.sessionId,
      createIfMissing: false,
    });

    if (!cart.cartId) {
      throw new NotFoundException('Cart not found for this session');
    }

    return this.updateCartItemUseCase.execute({
      tenantId: request.tenantId,
      cartId: cart.cartId,
      cartItemId,
      quantity: body.quantity,
    });
  }

  /**
   * DELETE /storefront/cart/items/:cartItemId?qr=TOKEN
   * Removes an item from the cart.
   */
  @Delete('items/:cartItemId')
  async removeItem(
    @Req() request: QrRequest,
    @Param('cartItemId') cartItemId: string,
  ) {
    const cart = await this.getOrCreateCartUseCase.execute({
      tenantId: request.tenantId,
      sessionId: request.sessionId,
      createIfMissing: false,
    });

    if (!cart.cartId) {
      throw new NotFoundException('Cart not found for this session');
    }

    return this.removeCartItemUseCase.execute({
      tenantId: request.tenantId,
      cartId: cart.cartId,
      cartItemId,
    });
  }
}
