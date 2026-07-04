import { Injectable, Inject } from '@nestjs/common';
import { CART_REPOSITORY_PORT, ICartRepository, CartSnapshot } from '../../core/ports/cart.repository.port';
import { CartNotFoundError } from '../../core/errors/cart.errors';

export interface UpdateCartItemInput {
  tenantId: string;
  cartId: string;
  cartItemId: string;
  quantity: number;
}

@Injectable()
export class UpdateCartItemUseCase {
  constructor(
    @Inject(CART_REPOSITORY_PORT)
    private readonly cartRepository: ICartRepository,
  ) {}

  async execute(input: UpdateCartItemInput): Promise<CartSnapshot> {
    const cart = await this.cartRepository.findById(input.tenantId, input.cartId);

    if (!cart) {
      throw new CartNotFoundError(input.cartId);
    }

    cart.updateItem(input.cartItemId, input.quantity);

    await this.cartRepository.update(cart);

    return cart.toSnapshot();
  }
}
