import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto'; // Advanced security tool

@Injectable()
export class ServiceTokenGuard implements CanActivate {
    private readonly expectedToken: string;

    constructor() {
        // 1. We load the "Secret Handshake" from the server environment
        this.expectedToken = process.env.INTERNAL_API_SERVICE_TOKEN ?? '';
    }

    canActivate(ctx: ExecutionContext): boolean {
        if (!this.expectedToken) throw new UnauthorizedException();

        const req = ctx.switchToHttp().getRequest<Request>();
        const header = req.header('authorization');

        if (!header || !header.startsWith('Bearer ')) {
            throw new UnauthorizedException();
        }

        const supplied = header.slice(7).trim();

        // 2. TIMING SAFE EQUAL (The Pro Lesson)
        // We don't use '===' because hackers can measure how many milliseconds 
        // it takes to compare strings to guess the token. 
        // timingSafeEqual makes the comparison take the same time every time!
        const isMatch = this.compareTokens(supplied, this.expectedToken);

        if (!isMatch) throw new UnauthorizedException();
        return true;
    }

    private compareTokens(supplied: string, expected: string): boolean {
        try {
            // Use any to bypass the strict TypeScript type check
            const a: any = Buffer.from(supplied);
            const b: any = Buffer.from(expected);

            if (a.length !== b.length) {
                return false;
            }

            return timingSafeEqual(a, b);
        } catch {
            return false;
        }
    }


}
