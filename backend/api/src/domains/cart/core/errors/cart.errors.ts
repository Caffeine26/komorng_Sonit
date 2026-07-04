import { NotFoundError, ConflictError, ValidationError } from '../../../../shared/errors/domain-error';

export class CartNotFoundError extends NotFoundError {
  constructor(cartId: string) {
    super(`Cart with ID ${cartId} not found`);
    this.name = 'CartNotFoundError';
  }
}

export class CartAlreadyConvertedError extends ConflictError {
  constructor(cartId: string) {
    super(`Cart with ID ${cartId} is already converted to an order`);
    this.name = 'CartAlreadyConvertedError';
  }
}

export class CartItemNotFoundError extends NotFoundError {
  constructor(cartItemId: string) {
    super(`Cart item with ID ${cartItemId} not found`);
    this.name = 'CartItemNotFoundError';
  }
}

export class CartEmptyError extends ValidationError {
  constructor() {
    super(`Cannot submit an empty cart`);
    this.name = 'CartEmptyError';
  }
}

export class CartSessionMismatchError extends ConflictError {
  constructor() {
    super(`Cart session mismatch`);
    this.name = 'CartSessionMismatchError';
  }
}
