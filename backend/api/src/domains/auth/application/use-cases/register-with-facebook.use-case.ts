import { Injectable, Inject } from '@nestjs/common';
import { ValidationError, UnauthorizedError, ConflictError } from '../../../../shared/errors/domain-error';
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
import { generateRawRefreshToken, hashRefreshToken, JWT_EXPIRY_SECONDS, REFRESH_EXPIRY_MS, LoginResult } from './login-with-telegram.use-case';



@Injectable()
export class RegisterWithFacebookUseCase {
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

    // 2. Ensure they don't already exist
    const existingUser = await this.userRepo.findByProviderId('FACEBOOK', fbUser.id);
    if (existingUser) {
      throw new ConflictError('Account already exists. Please log in instead.');
    }

    const fullName = fbUser.name || 'Facebook User';
    const avatarUrl = fbUser.picture?.data?.url || null;
    const userId = randomUUID();

    // 3. Register user
    await this.authOnboardingRepository.registerUserWithProvider(
        userId,
        fullName,
        fbUser.email || null,
        avatarUrl,
        fbUser.id,
        fullName,
        'FACEBOOK'
    );

    const user = await this.userRepo.findById(userId) as UserEntity;

    // 4. Generate tokens (brand new user will have no tenant)
    const roles = user.roleNames;
    const payload = { sub: user.id, email: user.email, tenantId: null, roles };

    const accessToken = await this.jwtService.signAsync(payload, {
        expiresIn: JWT_EXPIRY_SECONDS,
        secret: this.envConfig.get<string>('JWT_SECRET'),
    });

    const rawRefreshToken = generateRawRefreshToken();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

    await this.refreshRepo.create({ userId: user.id, tenantId: null, tokenHash, expiresAt });

    return {
      accessToken,
      rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles,
        tenantId: null,
        tenantStatus: null,
        tenantSlug: null
      }
    };
  }
}
