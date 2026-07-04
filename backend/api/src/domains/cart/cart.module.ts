import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { CART_REPOSITORY_PORT } from './core/ports/cart.repository.port';
import { CartRepositoryImpl } from './infra/repositories/prisma-cart.repository';
import { GetOrCreateCartUseCase } from './application/use-cases/get-or-create-cart.use-case';
import { AddCartItemUseCase } from './application/use-cases/add-cart-item.use-case';
import { UpdateCartItemUseCase } from './application/use-cases/update-cart-item.use-case';
import { RemoveCartItemUseCase } from './application/use-cases/remove-cart-item.use-case';

@Module({
  imports: [PrismaModule],
  providers: [
    // Repository binding — port symbol → Prisma implementation
    {
      provide: CART_REPOSITORY_PORT,
      useClass: CartRepositoryImpl,
    },

    // Use cases
    GetOrCreateCartUseCase,
    AddCartItemUseCase,
    UpdateCartItemUseCase,
    RemoveCartItemUseCase,
  ],
  exports: [
    GetOrCreateCartUseCase,
    AddCartItemUseCase,
    UpdateCartItemUseCase,
    RemoveCartItemUseCase,
  ],
})
export class CartModule {}
