import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
// IMPORTANT: We point to your NEW auth domain here
import type { JwtPayload } from '../../domains/auth/application/use-cases/login-with-telegram.use-case';

/**
 * JWT authentication guard.
 * FAIL CLOSED by default: Any route without @Public() requires a valid JWT.
 * Now supports "Soft-Auth": Populates request.user even for @Public() routes if token is present.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
        private readonly reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // 1. Check for @Public() sticker
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        const request = context.switchToHttp().getRequest<Request>();

        /**
         * 2. DEV BYPASS
         */
        const devTenantId = request.headers['x-tenant-id'] as string;
        if (devTenantId && process.env.NODE_ENV !== 'production') {
            (request as any).user = {
                tenantId: devTenantId,
                roles: ['TENANT_OWNER'],
                sub: 'dev-user-id',
                email: 'dev@xfos.com'
            };
            return true;
        }

        // 3. Extract the token
        const token = this.extractBearerToken(request);

        if (!token) {
            console.log(`[JwtAuthGuard] No token found. Cookies present: ${Object.keys(request.cookies || {}).join(', ') || 'NONE'}`);
            if (isPublic) return true;
            throw new UnauthorizedException({
                code: 'AUTH_TOKEN_INVALID',
                message: 'No access token provided',
            });
        }

        const secret = this.config.get<string>('JWT_SECRET');
        if (!secret) {
            throw new Error('JWT_SECRET env var is not set');
        }

        try {
            // 4. Verify and attach to request
            const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
            console.log(`[JwtAuthGuard] Token verified for user: ${payload.sub}`);
            (request as any).user = payload;
            return true;
        } catch (err: any) {
            console.log(`[JwtAuthGuard] Token verification failed: ${err?.message || 'Unknown error'}`);
            // If it's public, we don't care if the token is invalid (it's a guest)
            if (isPublic) return true;
            
            throw new UnauthorizedException({
                code: 'AUTH_TOKEN_INVALID',
                message: 'Access token is invalid or expired',
            });
        }
    }

    /**
     * Helper function to find the token in the header or cookie
     */
    private extractBearerToken(request: Request): string | null {
        // 1. Check Authorization Header
        const authHeader = request.headers['authorization'];
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }

        // 2. Check Cookie (accessToken)
        const cookieToken = request.cookies?.['accessToken'];
        if (cookieToken) return cookieToken;

        return null;
    }
}
