import { Injectable, Inject } from '@nestjs/common';
import { ValidationError } from '../../../../shared/errors/domain-error';
import { UserNotFoundError, InvalidOtpError, InvalidCredentialsError, ProviderAlreadyLinkedError } from '../../core/errors/auth.errors';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { IAuthOnboardingRepository, AUTH_ONBOARDING_REPOSITORY_PORT } from '../../core/ports/auth-onboarding.repository.port';
import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../core/ports/user.repository.port';
import { RefreshTokenRepositoryPort, REFRESH_TOKEN_REPOSITORY_PORT } from '../../core/ports/refresh-token.repository.port';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant.repository.port';
import * as crypto from 'crypto';
import { UserEntity } from '../../core/entities/user.entity';
import { IFacebookAuthService, FACEBOOK_AUTH_SERVICE_PORT } from '../../core/ports/facebook-auth.service.port';
import { generateRawRefreshToken, hashRefreshToken, JWT_EXPIRY_SECONDS, REFRESH_EXPIRY_MS, LoginResult } from './login-with-telegram.use-case';

@Injectable()
export class LinkFacebookToTelegramUseCase {
  constructor(
    private readonly prisma: PrismaService,
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

  async execute(facebookAccessToken: string, telegramIdentifier: string, otp: string): Promise<LoginResult> {
    if (!facebookAccessToken) throw new ValidationError('Facebook token is required');
    if (!telegramIdentifier) throw new ValidationError('Telegram identifier is required');
    if (!otp) throw new ValidationError('OTP is required');

    // 1. Resolve Telegram Chat ID
    const identifier = telegramIdentifier.replace('@', '');
    let telegramProvider = await this.authOnboardingRepository.findTelegramProvider(identifier);
    if (!telegramProvider) {
      telegramProvider = await this.authOnboardingRepository.findTelegramProviderByUsername(identifier);
    }
    if (!telegramProvider) {
      throw new UserNotFoundError(telegramIdentifier);
    }

    // 2. Verify OTP
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const attempt = await this.prisma.phoneOtpAttempt.findFirst({
      where: {
        phone: telegramProvider.providerId,
        purpose: 'link_account',
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!attempt) {
      throw new InvalidOtpError('Invalid or expired OTP.');
    }

    if (attempt.otpHash !== otpHash) {
      // Increment attempt count
      await this.prisma.phoneOtpAttempt.update({
        where: { id: attempt.id },
        data: { attemptCount: { increment: 1 } }
      });
      throw new InvalidOtpError('Invalid OTP.');
    }

    if (attempt.expiresAt < new Date()) {
      throw new InvalidOtpError('OTP has expired. Please request a new one.');
    }

    if (attempt.attemptCount >= 5) {
      throw new InvalidOtpError('Too many invalid attempts. Please request a new OTP.');
    }

    // Mark as used
    await this.prisma.phoneOtpAttempt.update({
      where: { id: attempt.id },
      data: { usedAt: new Date() }
    });

    // 3. Verify Facebook Token
    const fbUser = await this.facebookAuthService.verifyAndGetUser(facebookAccessToken);

    if (!fbUser || !fbUser.id) {
      throw new InvalidCredentialsError('Could not retrieve Facebook profile');
    }

    // 4. Link Facebook provider to the Telegram user
    const existingFacebookProvider = await this.userRepo.findByProviderId('FACEBOOK', fbUser.id);
    if (existingFacebookProvider) {
        if (existingFacebookProvider.id !== telegramProvider.userId) {
            throw new ProviderAlreadyLinkedError('Facebook');
        }
    } else {
        await this.userRepo.linkProvider(
            telegramProvider.userId,
            {
                provider: 'FACEBOOK',
                providerId: fbUser.id,
                displayName: fbUser.name || 'Facebook User',
            }
        );
    }

    // 5. Generate and return tokens for the unified user
    const user = await this.userRepo.findById(telegramProvider.userId) as UserEntity;

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
        console.warn(`[FacebookLink] Tenant resolution failed for user ${user.id}:`, err?.message);
    }

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
