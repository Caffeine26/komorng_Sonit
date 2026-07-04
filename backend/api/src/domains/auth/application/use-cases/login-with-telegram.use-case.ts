import { UnauthorizedError } from '../../../../shared/errors/domain-error';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { IAuthOnboardingRepository, AUTH_ONBOARDING_REPOSITORY_PORT } from '../../core/ports/auth-onboarding.repository.port';

import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../core/ports/user.repository.port';
import {
    RefreshTokenRepositoryPort,
    REFRESH_TOKEN_REPOSITORY_PORT,
} from '../../core/ports/refresh-token.repository.port';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant.repository.port';
import { UserEntity } from '../../core/entities/user.entity';

export const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function generateRawRefreshToken(): string {
    return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
}

export interface JwtPayload {
    sub: string;
    email?: string | null;
    tenantId: string | null;
    roles: string[];
    telegramId?: string;
}

export interface LoginResult {
    accessToken: string;
    rawRefreshToken: string;
    user: {
        id: string;
        email?: string | null;
        phone?: string | null;
        fullName?: string | null;
        avatarUrl?: string | null;
        roles: string[];
        tenantId: string | null;
        tenantStatus?: string | null;
        tenantSlug?: string | null;
    };
}

@Injectable()
export class LoginWithTelegramUseCase {
    constructor(
        @Inject(USER_REPOSITORY_PORT)
        private readonly userRepo: UserRepositoryPort,
        @Inject(REFRESH_TOKEN_REPOSITORY_PORT)
        private readonly refreshRepo: RefreshTokenRepositoryPort,
        @Inject(TENANT_REPOSITORY_PORT)
        private readonly tenantRepo: ITenantRepository,
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
        @Inject(AUTH_ONBOARDING_REPOSITORY_PORT)
        private readonly authOnboardingRepository: IAuthOnboardingRepository,
    ) { }

    async execute(telegramId: string, telegramData: any): Promise<LoginResult> {
        /**
         * 1. VERIFY TELEGRAM HASH
         * This ensures the request actually came from Telegram.
         */
        this.verifyTelegramHash(telegramData);

        /**
         * 2. FIND OR CREATE USER
         */
        let user = await this.userRepo.findByProviderId('TELEGRAM', telegramId);

        const fullName = [telegramData?.first_name, telegramData?.last_name]
            .filter(Boolean)
            .join(' ');
        const avatarUrl = telegramData?.photo_url || null;
        const telegramUsername = telegramData?.username || fullName || 'Telegram User';

        if (!user) {
            const userId = randomUUID();
            await this.authOnboardingRepository.registerUserWithProvider(
                userId,
                fullName || 'Telegram User',
                null,
                avatarUrl,
                telegramId,
                telegramUsername
            );

            user = await this.userRepo.findById(userId) as UserEntity;
        } else {
            // Update existing user details if they changed on Telegram
            const updates: any = {};
            if (fullName && fullName !== user.fullName) {
                updates.fullName = fullName;
            }
            if (avatarUrl && avatarUrl !== user.avatarUrl) {
                updates.avatarUrl = avatarUrl;
            }

            const providerUpdates = { displayName: telegramUsername, avatarUrl };
            await this.authOnboardingRepository.updateUserAndProvider(user.id, updates, providerUpdates);

            if (Object.keys(updates).length > 0) {
                user = UserEntity.rehydrate({
                    ...user,
                    fullName: updates.fullName !== undefined ? updates.fullName : user.fullName,
                    avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : user.avatarUrl,
                } as any);
            }
        }

        /**
         * 3. RESOLVE TENANT & STATUS SAFELY
         */
        let tenantId: string | null = null;
        let tenantStatus: string | null = null;
        let tenantSlug: string | null = null;

        try {
            if (user.roles && user.roles.length > 0) {
                tenantId = user.resolvePrimaryTenantId();
                if (tenantId) {
                    const tenant = await this.tenantRepo.findById(tenantId);
                    tenantStatus = tenant?.status || null;
                    tenantSlug = tenant?.slug || null;
                }
            }
        } catch (err: any) {
            console.warn(`[TelegramAuth] Tenant resolution failed for user ${user.id}:`, err?.message);
        }

        /**
         * 4. GENERATE TOKENS
         */
        const roles = user.roleNames;
        const payload: JwtPayload = { sub: user.id, email: user.email, tenantId, roles, telegramId };

        const accessToken = await this.jwtService.signAsync(payload, {
            expiresIn: JWT_EXPIRY_SECONDS,
            secret: this.config.get<string>('JWT_SECRET'),
        });

        const rawRefreshToken = generateRawRefreshToken();
        const tokenHash = hashRefreshToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

        await this.refreshRepo.create({ userId: user.id, tenantId, tokenHash, expiresAt });

        return {
            accessToken,
            rawRefreshToken,
            user: { id: user.id, email: user.email, roles, tenantId, tenantStatus, tenantSlug } as any,
        };
    }

    private verifyTelegramHash(data: any) {
        const { hash, ...userData } = data;
        if (!hash) {
            throw new UnauthorizedError('Telegram hash is missing');
        }

        const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
        if (!botToken) {
            throw new Error('TELEGRAM_BOT_TOKEN is not configured');
        }

        // 1. Create data check string
        // [manager] ONLY include fields that have values and are part of the official Telegram spec.
        const officialKeys = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'];
        const checkString = Object.keys(userData)
            .filter(key => officialKeys.includes(key) && userData[key] !== undefined && userData[key] !== null)
            .sort()
            .map(key => `${key}=${userData[key]}`)
            .join('\n');

        // 2. Secret key is SHA256 of bot token
        const secretKey = createHash('sha256')
            .update(botToken)
            .digest();

        // 3. HMAC-SHA256 of checkString using secretKey
        const hmac = createHmac('sha256', secretKey)
            .update(checkString)
            .digest('hex');

        if (hmac !== hash) {
            console.error('[TelegramAuth] Hash mismatch!', {
                expected: hmac,
                received: hash,
                checkString,
                userData
            });
            throw new UnauthorizedError('Telegram hash verification failed');
        }
    }
}
