/**
 * Base class for all domain errors. Pure TypeScript — no framework imports.
 * Concrete errors live under `backend/api/src/domains/<domain>/core/errors/`.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  readonly httpStatus = 422;
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  readonly httpStatus = 401;
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
}
