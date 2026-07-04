import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../../shared/errors/domain-error';
import { IAuthOnboardingRepository, AUTH_ONBOARDING_REPOSITORY_PORT } from '../../../../domains/auth/core/ports/auth-onboarding.repository.port';
import { Inject } from '@nestjs/common';
import { LoginWithTelegramUseCase } from './login-with-telegram.use-case';
import { randomUUID } from 'crypto';
import { TelegramNotificationTemplates } from '../../../notification/infra/telegram/message-templates';

@Injectable()
export class AcceptInvitationUseCase {
  constructor(
    @Inject(AUTH_ONBOARDING_REPOSITORY_PORT)
    private readonly authOnboardingRepository: IAuthOnboardingRepository,
    private readonly loginWithTelegram: LoginWithTelegramUseCase,
  ) { }

  async execute(inviteId: string, telegramData: any) {
    const invitation = await this.authOnboardingRepository.findInvitationById(inviteId);

    if (!invitation) {
      throw new NotFoundError('Invitation not found or invalid.');
    }

    if (invitation.status !== 'PENDING') {
      throw new ValidationError('This invitation has already been accepted or revoked.');
    }

    if (invitation.expiresAt < new Date()) {
      throw new ValidationError('This invitation has expired.');
    }

    const telegramId = telegramData.id.toString();

    // 2. Find or create the global user using their Telegram ID
    let user = await this.authOnboardingRepository.findUserByTelegramId(telegramId);

    let userId: string;

    if (!user) {
      userId = randomUUID();
      const fullName = [telegramData?.first_name, telegramData?.last_name]
        .filter(Boolean)
        .join(' ');
      const avatarUrl = telegramData?.photo_url || null;

      await this.authOnboardingRepository.registerUserWithProvider(
        userId,
        fullName || 'Telegram User',
        invitation.email || null,
        avatarUrl,
        telegramId,
        telegramData?.username || fullName
      );
    } else {
      userId = user.id;
      const avatarUrl = telegramData?.photo_url || null;
      // If user was registered via Telegram bot in PENDING status, activate them now
      const updates: any = {};
      if (user.status === 'PENDING') {
        updates.status = 'ACTIVE';
      }
      if (invitation.email && !user.email) {
        updates.email = invitation.email;
      }
      if (avatarUrl && !user.avatarUrl) {
        updates.avatarUrl = avatarUrl;
      }

      const providerUpdates: any = {};
      if (avatarUrl) providerUpdates.avatarUrl = avatarUrl;

      if (Object.keys(updates).length > 0 || Object.keys(providerUpdates).length > 0) {
        await this.authOnboardingRepository.updateUserAndProvider(userId, updates, providerUpdates);
      }
    }

    const existingRole = await this.authOnboardingRepository.findUserRole(userId, invitation.tenantId);

    if (!existingRole) {
      await this.authOnboardingRepository.createUserRole(userId, invitation.tenantId, invitation.role);
    }

    // 4. Mark invitation as accepted
    await this.authOnboardingRepository.markInvitationAccepted(invitation.tenantId, inviteId);

    const tenant = await this.authOnboardingRepository.findTenantById(invitation.tenantId);
    const restaurantName = tenant?.nameEn || invitation.tenantId;

    // Map role IDs to human-readable names
    const roleLabels: Record<string, string> = {
      TENANT_MANAGER: 'Manager',
      SERVICE_STAFF: 'Service Staff',
      KITCHEN_STAFF: 'Kitchen Staff',
    };
    const roleName = roleLabels[invitation.role] || invitation.role;

    // Push dynamic welcome Telegram notification to their chat ID
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      const welcomeText = TelegramNotificationTemplates.buildAcceptanceConfirmationMessage(restaurantName, telegramData?.first_name, roleName);

      try {
        const telegramApiUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
        await fetch(`${telegramApiUrl}/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramId,
            text: welcomeText,
            parse_mode: 'HTML',
          }),
        });
        console.log(`[AcceptInvite] Successfully sent confirmation message to @${telegramData?.username || telegramId}`);
      } catch (err: any) {
        console.error(`[AcceptInvite] Failed to send Telegram welcome message:`, err?.message);
      }
    }

    // 5. Perform the secure Telegram Login (automatically resolves active tenant because the UserRole exists!)
    const loginResult = await this.loginWithTelegram.execute(telegramId, telegramData);
    return loginResult;
  }
}
