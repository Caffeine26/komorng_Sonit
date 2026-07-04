import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { UnauthorizedError, NotFoundError } from '../../../../shared/errors/domain-error';
import { IAuthOnboardingRepository, AUTH_ONBOARDING_REPOSITORY_PORT } from '../../core/ports/auth-onboarding.repository.port';
import { UserRepositoryPort, USER_REPOSITORY_PORT } from '../../core/ports/user.repository.port';
import { RefreshTokenRepositoryPort, REFRESH_TOKEN_REPOSITORY_PORT } from '../../core/ports/refresh-token.repository.port';
import { ITenantRepository, TENANT_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant.repository.port';
import { ITenantCustomerRepository, TENANT_CUSTOMER_REPOSITORY_PORT } from '../../../tenant/core/ports/tenant-customer.repository.port';
import { UserEntity } from '../../core/entities/user.entity';
import { TenantCustomerEntity } from '../../../tenant/core/entities/tenant-customer.entity';
import { generateRawRefreshToken, hashRefreshToken, JWT_EXPIRY_SECONDS, REFRESH_EXPIRY_MS } from './login-with-telegram.use-case';
import { ITelegramNotificationService, TELEGRAM_NOTIFICATION_SERVICE } from '../../../notification/core/ports/telegram-notification.service.port';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface StorefrontLoginResult {
  accessToken: string;
  rawRefreshToken: string;
  user: {
    id: string;
    email?: string | null;
    fullName: string;
    avatarUrl?: string | null;
    tenantId: string;
    tenantSlug: string;
  };
}

@Injectable()
export class StorefrontTelegramLoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepo: UserRepositoryPort,
    @Inject(REFRESH_TOKEN_REPOSITORY_PORT)
    private readonly refreshRepo: RefreshTokenRepositoryPort,
    @Inject(TENANT_REPOSITORY_PORT)
    private readonly tenantRepo: ITenantRepository,
    @Inject(TENANT_CUSTOMER_REPOSITORY_PORT)
    private readonly tenantCustomerRepo: ITenantCustomerRepository,
    @Inject(AUTH_ONBOARDING_REPOSITORY_PORT)
    private readonly authOnboardingRepository: IAuthOnboardingRepository,
    @Inject(TELEGRAM_NOTIFICATION_SERVICE)
    private readonly telegramNotificationService: ITelegramNotificationService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) { }

  async execute(tenantSlug: string, telegramData: any, sessionId?: string): Promise<StorefrontLoginResult> {
    // 1. VERIFY TELEGRAM HASH
    this.verifyTelegramHash(telegramData);
    const telegramId = telegramData.id.toString();

    // 2. FIND OR CREATE GLOBAL USER
    let user = await this.userRepo.findByProviderId('TELEGRAM', telegramId);
    const fullName = [telegramData.first_name, telegramData.last_name].filter(Boolean).join(' ');
    const avatarUrl = telegramData.photo_url || null;
    const telegramUsername = telegramData.username || fullName || 'Telegram User';

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
      const updates: any = {};
      if (fullName && fullName !== user.fullName) updates.fullName = fullName;
      if (avatarUrl && avatarUrl !== user.avatarUrl) updates.avatarUrl = avatarUrl;
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

    // 3. RESOLVE TENANT
    const tenant = await this.tenantRepo.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError(`Tenant with slug ${tenantSlug} not found`);
    }

    // 4. UPSERT TENANT CUSTOMER
    let customer = await this.tenantCustomerRepo.findByTenantAndUserId(tenant.id, user.id);
    let isNewCustomer = false;
    if (!customer) {
      customer = TenantCustomerEntity.create({
        tenantId: tenant.id,
        id: randomUUID(),
        userId: user.id,
      });
      isNewCustomer = true;
    } else {
      customer = TenantCustomerEntity.rehydrate({
        ...customer,
        lastVisitAt: new Date(),
      } as any);
    }
    await this.tenantCustomerRepo.upsert(customer);

    if (isNewCustomer || !user.phone) {
      const messageText = isNewCustomer
        ? `🎉 Welcome to ${tenant.name}! 🎉\n\nTo complete your profile and receive order updates via SMS, please share your phone number with us below!`
        : `Welcome back to ${tenant.name}! To complete your profile and receive important order updates, please share your phone number with us below!`;

      const replyMarkup = {
        keyboard: [[{ text: '📱 Share Phone Number', request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      };

      this.telegramNotificationService.sendDirectMessage(
        telegramId,
        messageText,
        replyMarkup
      ).catch(err => console.error('Failed to send phone number request', err));
    }

    // 4.5 MERGE GUEST ORDERS
    if (sessionId) {
      await this.prisma.order.updateMany({
        where: { tenantId: tenant.id, sessionId, userId: null },
        data: { userId: user.id, tenantCustomerId: customer.id }
      });
    }

    // 5. ISSUE JWT (CUSTOMER ROLE)
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: tenant.id,
      roles: [], // intentionally empty — tenantId presence identifies a customer
      telegramId,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: JWT_EXPIRY_SECONDS,
      secret: this.config.get<string>('JWT_SECRET'),
    });

    const rawRefreshToken = generateRawRefreshToken();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

    await this.refreshRepo.create({ userId: user.id, tenantId: tenant.id, tokenHash, expiresAt });

    return {
      accessToken,
      rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName || 'Telegram User',
        avatarUrl: user.avatarUrl,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      },
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

    const officialKeys = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'];
    const checkString = Object.keys(userData)
      .filter(key => officialKeys.includes(key) && userData[key] !== undefined && userData[key] !== null)
      .sort()
      .map(key => `${key}=${userData[key]}`)
      .join('\n');

    const secretKey = createHash('sha256').update(botToken).digest();
    const hmac = createHmac('sha256', secretKey).update(checkString).digest('hex');

    if (hmac !== hash) {
      console.error('[StorefrontTelegramAuth] Hash mismatch!', {
        expected: hmac,
        received: hash,
        checkString,
      });
      throw new UnauthorizedError('Telegram hash verification failed');
    }

    const authDate = parseInt(userData.auth_date, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      throw new UnauthorizedError('Telegram auth data has expired');
    }
  }
}
