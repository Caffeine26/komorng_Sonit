import { Injectable, Inject } from '@nestjs/common';
import { ValidationError, UnauthorizedError } from '../../../../shared/errors/domain-error';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { IAuthOnboardingRepository, AUTH_ONBOARDING_REPOSITORY_PORT } from '../../core/ports/auth-onboarding.repository.port';
import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../core/ports/user.repository.port';
import {
    RefreshTokenRepositoryPort,
    REFRESH_TOKEN_REPOSITORY_PORT,
} from '../../core/ports/refresh-token.repository.port';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant.repository.port';
import { UserEntity } from '../../core/entities/user.entity';
import { IFacebookAuthService, FACEBOOK_AUTH_SERVICE_PORT, FacebookUserResponse } from '../../core/ports/facebook-auth.service.port';
import { randomUUID } from 'node:crypto';
import { generateRawRefreshToken, hashRefreshToken, JWT_EXPIRY_SECONDS, REFRESH_EXPIRY_MS, JwtPayload, LoginResult } from './login-with-telegram.use-case';



@Injectable()
export class LoginWithFacebookUseCase {
  constructor(
      @Inject(USER_REPOSITORY_PORT)
      private readonly userRepo: UserRepositoryPort,
      @Inject(REFRESH_TOKEN_REPOSITORY_PORT)
      private readonly refreshRepo: RefreshTokenRepositoryPort,
      @Inject(TENANT_REPOSITORY_PORT)
      private readonly tenantRepo: ITenantRepository,
      private readonly jwtService: JwtService,
      private readonly envConfig: ConfigService,
      @Inject(AUTH_ONBOARDING_REPOSITORY_PORT)
      private readonly authOnboardingRepository: IAuthOnboardingRepository,
      @Inject(FACEBOOK_AUTH_SERVICE_PORT)
      private readonly facebookAuthService: IFacebookAuthService,
  ) {}

  async execute(facebookAccessToken: string): Promise<LoginResult> {
    if (!facebookAccessToken) {
      throw new ValidationError('Facebook access token is required');
    }

    // 1. Verify token with Facebook Graph API
    const fbUser = await this.facebookAuthService.verifyAndGetUser(facebookAccessToken);

    if (!fbUser || !fbUser.id) {
      throw new UnauthorizedError('Could not retrieve Facebook profile');
    }

    // 2. Find or create user
    let user = await this.userRepo.findByProviderId('FACEBOOK', fbUser.id);
    
    const fullName = fbUser.name || 'Facebook User';
    const avatarUrl = fbUser.picture?.data?.url || null;

    if (!user) {
      // PHASE 1: Account Linking - Halt auto-creation and return a signal
      return {
        status: 'ACCOUNT_NOT_FOUND',
        facebookData: fbUser,
        facebookAccessToken
      } as any;
    }

    // Update existing user (if properties changed)
    const updates: any = {};
    if (fullName && fullName !== user.fullName) {
        updates.fullName = fullName;
    }
    if (avatarUrl && avatarUrl !== user.avatarUrl) {
        updates.avatarUrl = avatarUrl;
    }

    const providerUpdates = { displayName: fullName, avatarUrl };
    await this.authOnboardingRepository.updateUserAndProvider(user.id, updates, providerUpdates, 'FACEBOOK');

    if (Object.keys(updates).length > 0) {
        user = UserEntity.rehydrate({
            ...user,
            fullName: updates.fullName !== undefined ? updates.fullName : user.fullName,
            avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : user.avatarUrl,
        } as any);
    }

    // 3. Resolve tenant safely
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
        console.warn(`[FacebookAuth] Tenant resolution failed for user ${user.id}:`, err?.message);
    }

    // 4. Generate tokens
    const roles = user.roleNames;
    const payload = { sub: user.id, email: user.email, tenantId, roles };

    const accessToken = await this.jwtService.signAsync(payload, {
        expiresIn: JWT_EXPIRY_SECONDS,
        secret: this.envConfig.get<string>('JWT_SECRET'),
    });

    const rawRefreshToken = generateRawRefreshToken();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

    await this.refreshRepo.create({ userId: user.id, tenantId, tokenHash, expiresAt });

    return {
      accessToken,
      rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles,
        tenantId,
        tenantStatus,
        tenantSlug
      }
    };
  }
}
