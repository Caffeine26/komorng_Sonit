import { UnauthorizedError, ConflictError } from '../../../../shared/errors/domain-error';
import { createHmac, createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../core/ports/user.repository.port';
import { UserEntity } from '../../core/entities/user.entity';
import { randomUUID } from 'crypto';
import {
    LoginResult,
    JwtPayload,
    JWT_EXPIRY_SECONDS,
    generateRawRefreshToken,
    hashRefreshToken,
    REFRESH_EXPIRY_MS
} from './login-with-telegram.use-case';
import { RefreshTokenRepositoryPort, REFRESH_TOKEN_REPOSITORY_PORT } from '../../core/ports/refresh-token.repository.port';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant.repository.port';
import { UserStatusEnum } from '@xfos/contracts-enums';

@Injectable()
export class RegisterWithTelegramUseCase {
    constructor(
        @Inject(USER_REPOSITORY_PORT)
        private readonly userRepo: UserRepositoryPort,
        @Inject(REFRESH_TOKEN_REPOSITORY_PORT)
        private readonly refreshRepo: RefreshTokenRepositoryPort,
        @Inject(TENANT_REPOSITORY_PORT)
        private readonly tenantRepo: ITenantRepository,
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
    ) { }

    async execute(telegramId: string, telegramData: any): Promise<LoginResult> {
        // 1. Verify Telegram Authenticity
        const isValid = this.verifyTelegramHash(telegramData);
        if (!isValid) {
            throw new UnauthorizedError('Invalid Telegram authentication data.');
        }

        // 2. Check existence
        const existing = await this.userRepo.findByProviderId('TELEGRAM', telegramId);
        
        if (existing) {
          const roles = existing.roleNames;
          
          // Resolve tenant if they already have one
          let tenantId: string | null = null;
          let tenantStatus: string | null = null;
          let tenantSlug: string | null = null;

          if (roles.length > 0) {
            try {
              tenantId = existing.resolvePrimaryTenantId();
              if (tenantId) {
                const tenant = await this.tenantRepo.findById(tenantId);
                tenantStatus = tenant?.status || null;
                tenantSlug = tenant?.slug || null;
              }
            } catch (e) {
              // Ignore if no tenant-scoped roles found
            }
          }

          const payload = { 
            sub: existing.id, 
            email: existing.email, 
            tenantId,
            roles
          };
          
          const accessToken = await this.jwtService.signAsync(payload, { 
            expiresIn: JWT_EXPIRY_SECONDS,
            secret: this.config.get<string>('JWT_SECRET')
          });
          
          const rawRefreshToken = generateRawRefreshToken();

          await this.refreshRepo.create({
            userId: existing.id,
            tenantId,
            tokenHash: hashRefreshToken(rawRefreshToken),
            expiresAt: new Date(Date.now() + REFRESH_EXPIRY_MS),
          });

          return {
            accessToken,
            rawRefreshToken,
            user: {
              id: existing.id,
              email: existing.email,
              roles,
              tenantId,
              tenantStatus,
              tenantSlug
            },
          };
        }

        // 3. Create New User Entity
        const user = UserEntity.create({
            id: randomUUID(),
            fullName: `${telegramData.first_name} ${telegramData.last_name || ''}`.trim(),
            avatarUrl: telegramData.photo_url,
            status: UserStatusEnum.Enum.ACTIVE,
        });

        // 4. Persist User and Link Telegram Provider
        await this.userRepo.create(user, {
            provider: 'TELEGRAM',
            providerId: telegramId,
            displayName: telegramData.username || telegramData.first_name,
        });

        // 5. Issue JWT and Refresh Token
        const roles: string[] = [];
        const payload: JwtPayload = {
            sub: user.id,
            roles,
            tenantId: null, // No tenant yet
            telegramId,
        };

        const accessToken = await this.jwtService.signAsync(payload, { 
            expiresIn: JWT_EXPIRY_SECONDS,
            secret: this.config.get<string>('JWT_SECRET')
        });
        
        const rawRefreshToken = generateRawRefreshToken();

        await this.refreshRepo.create({
            userId: user.id,
            tenantId: null,
            tokenHash: hashRefreshToken(rawRefreshToken),
            expiresAt: new Date(Date.now() + REFRESH_EXPIRY_MS),
        });

        return {
            accessToken,
            rawRefreshToken,
            user: { id: user.id, email: user.email, roles: [], tenantId: null, tenantStatus: null, tenantSlug: null },
        };
    }

    private verifyTelegramHash(data: any): boolean {
        const { hash, ...rest } = data;
        const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
        const checkString = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('\n');
        const secretKey = createHash('sha256').update(botToken!).digest();
        const hmac = createHmac('sha256', secretKey as any).update(checkString).digest('hex');
        return hmac === hash;
    }
}
