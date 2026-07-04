import { NotFoundError, UnauthorizedError, ConflictError } from '../../../../shared/errors/domain-error';

export class UserNotFoundError extends NotFoundError {
  constructor(identifier: string) {
    super(`User with identifier ${identifier} not found`);
    this.name = 'UserNotFoundError';
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  constructor(message: string = 'Invalid credentials') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class FacebookAccountLinkingError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = 'FacebookAccountLinkingError';
  }
}

export class InvalidOtpError extends UnauthorizedError {
  constructor(message: string = 'Invalid OTP') {
    super(message);
    this.name = 'InvalidOtpError';
  }
}

export class ProviderAlreadyLinkedError extends ConflictError {
  constructor(provider: string) {
    super(`This ${provider} account is already linked to a different user.`);
    this.name = 'ProviderAlreadyLinkedError';
  }
}
