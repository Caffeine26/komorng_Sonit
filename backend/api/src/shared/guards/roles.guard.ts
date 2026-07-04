import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import type { JwtPayload } from '../../domains/auth/application/use-cases/login-with-telegram.use-case';

/**
 * Role-based access control guard.
 * This guard is applied AFTER JwtAuthGuard so request.user is always populated.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    // 1. Scan for the @Roles sticker
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 2. If no sticker is present, we allow them in (they are already logged in)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // 3. Get the user badge (attached by JwtAuthGuard)
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const userRoles = request.user?.roles ?? [];

    // 4. Compare the badges
    const hasRole = requiredRoles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      // Professional error format matching your advisor's code
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient role for this action',
      });
    }

    return true;
  }
}
