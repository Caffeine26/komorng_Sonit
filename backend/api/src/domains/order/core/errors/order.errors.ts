import { NotFoundError, ConflictError, ValidationError } from '../../../../shared/errors/domain-error';

export class OrderNotFoundError extends NotFoundError {
  constructor(orderId: string) {
    super(`Order with ID ${orderId} not found`);
    this.name = 'OrderNotFoundError';
  }
}

export class OrderAlreadyCancelledError extends ConflictError {
  constructor(orderId: string) {
    super(`Order with ID ${orderId} is already cancelled`);
    this.name = 'OrderAlreadyCancelledError';
  }
}

export class InvalidOrderTransitionError extends ValidationError {
  constructor(fromStatus: string, toStatus: string) {
    super(`Cannot transition order from ${fromStatus} to ${toStatus}`);
    this.name = 'InvalidOrderTransitionError';
  }
}

export class EmptyOrderError extends ValidationError {
  constructor() {
    super(`Cannot submit an empty order`);
    this.name = 'EmptyOrderError';
  }
}

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

export class ActiveSessionNotFoundError extends NotFoundError {
  constructor() {
    super('Active session not found');
    this.name = 'ActiveSessionNotFoundError';
  }
}

export class CartMismatchError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'CartMismatchError';
  }
}

export class OrderSessionMismatchError extends ValidationError {
  constructor() {
    super('Order not found for active session');
    this.name = 'OrderSessionMismatchError';
  }
}

export class EmptyCartError extends ValidationError {
  constructor() {
    super('Cart is empty');
    this.name = 'EmptyCartError';
  }
}

export class ReloadOrderFailedError extends ValidationError {
  constructor() {
    super('Failed to reload order after append');
    this.name = 'ReloadOrderFailedError';
  }
}
