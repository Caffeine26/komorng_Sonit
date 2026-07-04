import { Injectable, Inject } from '@nestjs/common';
import { ValidationError } from '../../../../shared/errors/domain-error';
import { UserNotFoundError } from '../../core/errors/auth.errors';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { TELEGRAM_NOTIFICATION_SERVICE, ITelegramNotificationService } from '../../../notification/core/ports/telegram-notification.service.port';
import { AUTH_ONBOARDING_REPOSITORY_PORT, IAuthOnboardingRepository } from '../../core/ports/auth-onboarding.repository.port';
import * as crypto from 'crypto';

@Injectable()
export class SendTelegramOtpUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TELEGRAM_NOTIFICATION_SERVICE)
    private readonly telegramNotificationService: ITelegramNotificationService,
    @Inject(AUTH_ONBOARDING_REPOSITORY_PORT)
    private readonly authOnboardingRepository: IAuthOnboardingRepository,
  ) {}

  async execute(telegramIdentifier: string): Promise<void> {
    if (!telegramIdentifier) {
      throw new ValidationError('Telegram username or chat ID is required');
    }

    // 1. Strip '@' if provided
    const identifier = telegramIdentifier.replace('@', '');

    // 2. Find the Telegram provider to ensure this user exists in our system
    let provider = await this.authOnboardingRepository.findTelegramProvider(identifier);
    if (!provider) {
        provider = await this.authOnboardingRepository.findTelegramProviderByUsername(identifier);
    }

    if (!provider) {
        throw new UserNotFoundError(telegramIdentifier);
    }

    // 3. Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    // 4. Save to PhoneOtpAttempt table (using providerId as the phone field)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.prisma.phoneOtpAttempt.create({
      data: {
        phone: provider.providerId, // store the actual chat ID so we can verify it reliably
        otpHash,
        purpose: 'link_account',
        expiresAt,
      }
    });

    // 5. Send message via TelegramBotService
    const message = `🔐 <b>Account Linking Request</b>\n\nYour Komorng verification code is: <b>${otp}</b>\n\n<i>This code will expire in 5 minutes. Do not share it with anyone.</i>`;
    await this.telegramNotificationService.sendDirectMessage(provider.providerId, message);
  }
}
