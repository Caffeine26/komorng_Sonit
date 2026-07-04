import { UnauthorizedError } from '../../../../shared/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../core/ports/user.repository.port';
import {
    RefreshTokenRepositoryPort,
    REFRESH_TOKEN_REPOSITORY_PORT,
} from '../../core/ports/refresh-token.repository.port';
import {
    hashRefreshToken,
    generateRawRefreshToken,
    JWT_EXPIRY_SECONDS,
    REFRESH_EXPIRY_MS,
    JwtPayload,
    LoginResult,
} from './login-with-telegram.use-case';

@Injectable()
export class RefreshUseCase {
    constructor(
        @Inject(USER_REPOSITORY_PORT)
        private readonly userRepo: UserRepositoryPort,
        @Inject(REFRESH_TOKEN_REPOSITORY_PORT)
        private readonly refreshRepo: RefreshTokenRepositoryPort,
        private readonly jwtService: JwtService,
        private readonly prisma: PrismaService,
    ) { }

    async execute(rawToken: string): Promise<LoginResult> {
        const tokenHash = hashRefreshToken(rawToken);
        const storedToken = await this.refreshRepo.findByHash(tokenHash);

        if (!storedToken || (storedToken.expiresAt && storedToken.expiresAt < new Date()) || storedToken.revokedAt) {
            throw new UnauthorizedError('Refresh token is expired, revoked, or missing');
        }

        const user = await this.userRepo.findById(storedToken.userId);
        if (!user || !user.isActive) {
            throw new UnauthorizedError('User account is no longer active');
        }

        // ROTATE: Delete old token, issue new one
        await this.refreshRepo.deleteByHash(tokenHash);

        let tenantId = storedToken.tenantId;
        if (!tenantId) {
            try {
                tenantId = user.resolvePrimaryTenantId();
            } catch (e) {
                // If they have no roles and no token tenantId, they are likely a storefront user whose token was malformed, or a global user.
                tenantId = null as any; 
            }
        }
        
        const roles = user.roleNames;

        const payload: JwtPayload = { sub: user.id, email: user.email, tenantId, roles };
        const accessToken = await this.jwtService.signAsync(payload, {
            expiresIn: JWT_EXPIRY_SECONDS,
        });

        const newRawToken = generateRawRefreshToken();
        const newTokenHash = hashRefreshToken(newRawToken);
        const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

        await this.refreshRepo.create({ userId: user.id, tenantId, tokenHash: newTokenHash, expiresAt });

        return {
            accessToken,
            rawRefreshToken: newRawToken,
            user: { 
                id: user.id, 
                email: user.email, 
                phone: user.phone,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
                roles, 
                tenantId, 
                tenantStatus: null, 
                tenantSlug: null 
            },
        };
    }

    async loginBySessionId(sessionId: string): Promise<LoginResult | null> {
        const order = await this.prisma.order.findFirst({
            where: { sessionId, userId: { not: null } },
            orderBy: { createdAt: 'desc' }
        });

        if (!order || !order.userId) {
            return null;
        }

        const user = await this.userRepo.findById(order.userId);
        if (!user || !user.isActive) {
            return null;
        }

        let tenantId = order.tenantId;
        const roles = user.roleNames;

        const payload: JwtPayload = { sub: user.id, email: user.email, tenantId, roles };
        const accessToken = await this.jwtService.signAsync(payload, {
            expiresIn: JWT_EXPIRY_SECONDS,
        });

        const newRawToken = generateRawRefreshToken();
        const newTokenHash = hashRefreshToken(newRawToken);
        const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

        await this.refreshRepo.create({ userId: user.id, tenantId, tokenHash: newTokenHash, expiresAt });

        let displayFullName = user.fullName ?? null;
        if (!displayFullName && user.phone) {
            let formattedPhone = user.phone;
            if (formattedPhone.startsWith('+855')) formattedPhone = '0' + formattedPhone.slice(4);
            else if (formattedPhone.startsWith('855')) formattedPhone = '0' + formattedPhone.slice(3);
            displayFullName = formattedPhone;
        }

        return {
            accessToken,
            rawRefreshToken: newRawToken,
            user: { 
                id: user.id, 
                email: user.email, 
                phone: user.phone,
                fullName: displayFullName,
                avatarUrl: user.avatarUrl,
                roles, 
                tenantId, 
                tenantStatus: null, 
                tenantSlug: null 
            },
        };
    }
}
