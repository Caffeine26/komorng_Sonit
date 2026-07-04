import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class InternalOnlyGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
        const req = ctx.switchToHttp().getRequest<Request>();
        const hostname = req.hostname;

        // 1. Localhost is always allowed for development
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

        // 2. Check if the request is inside the private server network (.railway.internal)
        const isInternalNetwork = hostname.endsWith('.railway.internal');

        if (!isLocal && !isInternalNetwork) {
            /**
             * 3. THE "HACKER TRAP" (The Pro Lesson)
             * We throw a 404 (Not Found), NOT a 403 (Forbidden).
             * If we throw 403, the hacker knows there is a secret API here.
             * If we throw 404, the hacker thinks there is NOTHING here.
             */
            throw new NotFoundException();
        }
        return true;
    }
}
