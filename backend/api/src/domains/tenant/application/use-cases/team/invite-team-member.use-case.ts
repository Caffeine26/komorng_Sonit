import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValidationError } from '../../../../../shared/errors/domain-error';
import { ITeamRepository, TEAM_REPOSITORY_PORT } from '../../../core/ports/team.repository.port';
import { randomBytes, createHash } from 'node:crypto';
import type { InviteMemberRequest } from '@xfos/contracts-bff-admin';
import { TelegramNotificationTemplates } from '../../../../notification/infra/telegram/message-templates';

@Injectable()
export class InviteTeamMemberUseCase {
  constructor(
    @Inject(TEAM_REPOSITORY_PORT)
    private readonly teamRepository: ITeamRepository,
    private readonly configService: ConfigService,
  ) {}

  async execute(
    tenantId: string,
    invitedById: string,
    data: InviteMemberRequest,
  ) {
    const cleanUsername = data.telegramUsername.replace('@', '').trim();

    // 1. Check if the user is already an active member of this tenant
    const existingRole = await this.teamRepository.findRoleByTelegramUsername(tenantId, cleanUsername);

    if (existingRole) {
      throw new ValidationError(`User @${cleanUsername} is already a member of this team.`);
    }

    // 2. Check if there is an active pending invitation for this telegram username
    const existingInvite = await this.teamRepository.findPendingInvitationByChannelId(tenantId, cleanUsername);

    if (existingInvite) {
      throw new ValidationError(`An active invitation for @${cleanUsername} already exists.`);
    }

    // 3. Generate a secure token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // 4. Set expiration (7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // 5. Create Invitation
    const invitation = await this.teamRepository.createInvitation(tenantId, {
        email: data.email || null,
        channel: 'telegram',
        channelId: cleanUsername,
        role: data.role as any,
        tokenHash,
        expiresAt,
        status: 'PENDING',
        invitedById,
    });

    // Fetch the tenant details to get the human-readable restaurant name
    const tenant = await this.teamRepository.findTenant(tenantId);

    const restaurantName = tenant?.nameEn || tenantId;

    // Map role IDs to human-readable names
    const roleLabels: Record<string, string> = {
      TENANT_MANAGER: 'Manager',
      SERVICE_STAFF: 'Service Staff',
      KITCHEN_STAFF: 'Kitchen Staff',
    };

    const roleName = roleLabels[invitation.role] || invitation.role;

    // 6. Push Telegram Notification if the staff member has already started the bot previously
    const targetProvider = await this.teamRepository.findTelegramProviderByUsername(cleanUsername);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (targetProvider && botToken) {
      const chatId = targetProvider.providerId;
      const adminUrl = process.env.ADMIN_APP_URL || process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3000';
      const acceptInviteLink = `${adminUrl}/auth/login?inviteId=${invitation.id}`;
      
      const messageText = TelegramNotificationTemplates.buildInviteMessage(restaurantName, cleanUsername, roleName);

      try {
        const telegramApiUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
        const res = await fetch(`${telegramApiUrl}/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '✅ Accept & Access Dashboard',
                    url: acceptInviteLink,
                  }
                ]
              ]
            }
          }),
        });
        if (!res.ok) {
          const errData = await res.json() as any;
          console.error(`[PushInvite] Telegram API returned error:`, errData);
        } else {
          console.log(`[PushInvite] Automatically pushed invitation to @${cleanUsername} (chatId: ${chatId})`);
        }
      } catch (err) {
        console.error(`[PushInvite] Failed to send push notification to @${cleanUsername}:`, err);
      }
    }

    return {
      id: invitation.id,
      name: invitation.channelId,
      telegramUsername: invitation.channelId,
      email: invitation.email || undefined,
      role: invitation.role as any,
      status: 'PENDING' as const,
      expiresAt: invitation.expiresAt.toISOString(),
      inviteUrl: `${this.configService.get<string>('TELEGRAM_BOT_URL', 'https://t.me/komorng_bot')}?start=inv_${invitation.id}`,
    };
  }
}
