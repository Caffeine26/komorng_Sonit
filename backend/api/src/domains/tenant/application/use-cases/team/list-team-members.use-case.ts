import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ITeamRepository, TEAM_REPOSITORY_PORT } from '../../../core/ports/team.repository.port';
import { Inject } from '@nestjs/common';
import type { TeamManagementOverview, TeamMemberResponse, PendingInviteResponse } from '@xfos/contracts-bff-admin';

@Injectable()
export class ListTeamMembersUseCase {
  constructor(
    @Inject(TEAM_REPOSITORY_PORT)
    private readonly teamRepository: ITeamRepository,
    private readonly configService: ConfigService,
  ) {}

  async execute(tenantId: string): Promise<TeamManagementOverview> {
    const telegramBotUrl = this.configService.get<string>('TELEGRAM_BOT_URL', 'https://t.me/komorng_bot');
    // 1. Fetch active user roles for this tenant
    const userRoles = await this.teamRepository.findManyRoles(tenantId);

    const members: TeamMemberResponse[] = userRoles.map((ur: any) => {
      const tgProvider = ur.user.authProviders?.find((ap: any) => ap.provider === 'TELEGRAM');
      return {
        id: ur.user.id,
        name: ur.user.fullName || 'No Name',
        email: ur.user.email || undefined,
        telegramUsername: tgProvider?.displayName || tgProvider?.providerId || undefined,
        role: ur.role as any,
        status: ur.user.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        joinedDate: ur.createdAt.toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        avatarUrl: ur.user.avatarUrl || undefined,
      };
    });

    // 2. Fetch pending invitations for this tenant
    const invitations = await this.teamRepository.findManyInvitations(tenantId);

    const pendingInvites: PendingInviteResponse[] = invitations.map((inv: any) => {
      const isExpired = inv.expiresAt < new Date();
      return {
        id: inv.id,
        name: inv.channelId || inv.email || 'Pending Staff',
        telegramUsername: inv.channelId || '',
        email: inv.email || undefined,
        role: inv.role as any,
        status: isExpired ? 'EXPIRED' : 'PENDING',
        expiresAt: inv.expiresAt.toISOString(),
        // Generates the official Telegram Bot deep link
        inviteUrl: `${telegramBotUrl}?start=inv_${inv.id}`,
      };
    });

    return {
      members,
      pendingInvites,
    };
  }
}
