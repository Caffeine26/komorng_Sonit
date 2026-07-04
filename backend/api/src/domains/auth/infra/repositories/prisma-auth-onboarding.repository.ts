import { Injectable } from '@nestjs/common';
import { IAuthOnboardingRepository } from '../../core/ports/auth-onboarding.repository.port';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

@Injectable()
export class PrismaAuthOnboardingRepository implements IAuthOnboardingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findInvitationById(id: string): Promise<any | null> {
    return this.prisma.invitation.findFirst({ where: { id } });
  }

  async findPendingInvitationByChannelIdGlobal(channelId: string): Promise<any | null> {
    return this.prisma.invitation.findFirst({
      where: {
        channelId: { equals: channelId, mode: 'insensitive' },
        status: 'PENDING',
        expiresAt: { gte: new Date() },
      },
    });
  }

  async findTenantById(id: string): Promise<any | null> {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async findUserByTelegramId(telegramId: string): Promise<any | null> {
    return this.prisma.user.findFirst({
      where: { authProviders: { some: { provider: 'TELEGRAM', providerId: telegramId } } },
    });
  }

  async registerUserWithProvider(userId: string, fullName: string, email: string | null, avatarUrl: string | null, providerId: string, displayName: string, provider: string = 'TELEGRAM'): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.create({
        data: { id: userId, fullName, status: 'ACTIVE', email, avatarUrl },
      }),
      this.prisma.userAuthProvider.create({
        data: { userId, provider: provider as any, providerId, displayName, avatarUrl },
      }),
    ]);
  }

  async registerBotUserAtomically(userId: string, fullName: string, email: string | null, avatarUrl: string | null, providerId: string, displayName: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.create({
        data: { id: userId, fullName, status: 'PENDING', email, avatarUrl },
      }),
      this.prisma.userAuthProvider.create({
        data: { userId, provider: 'TELEGRAM', providerId, displayName, avatarUrl },
      }),
    ]);
  }

  async updateUserAndProvider(userId: string, userUpdates: any, providerUpdates: any, provider: string = 'TELEGRAM'): Promise<void> {
    await this.prisma.$transaction(async (tx: any) => {
      if (Object.keys(userUpdates).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userUpdates });
      }
      if (Object.keys(providerUpdates).length > 0) {
        await tx.userAuthProvider.updateMany({
          where: { userId, provider: provider as any },
          data: providerUpdates,
        });
      }
    });
  }

  async findUserRole(userId: string, tenantId: string): Promise<any | null> {
    return this.prisma.userRole.findFirst({ where: { userId, tenantId } });
  }

  async createUserRole(userId: string, tenantId: string, role: string): Promise<void> {
    await this.prisma.userRole.create({
      data: { userId, tenantId, role: role as any },
    });
  }

  async markInvitationAccepted(tenantId: string, inviteId: string): Promise<void> {
    await this.prisma.invitation.update({
      where: { tenantId_id: { tenantId, id: inviteId } },
      data: { status: 'ACCEPTED' as any, acceptedAt: new Date() },
    });
  }

  async findTelegramProvider(providerId: string): Promise<any | null> {
    return this.prisma.userAuthProvider.findFirst({
      where: { provider: 'TELEGRAM', providerId },
    });
  }

  async findTelegramProviderByUsername(username: string): Promise<any | null> {
    return this.prisma.userAuthProvider.findFirst({
      where: { provider: 'TELEGRAM', displayName: { equals: username, mode: 'insensitive' } },
    });
  }

  async findUserPhone(telegramChatId: string): Promise<string | null> {
    const provider = await this.prisma.userAuthProvider.findFirst({
      where: { provider: 'TELEGRAM', providerId: telegramChatId },
      include: { user: { select: { phone: true } } },
    });
    return (provider as any)?.user?.phone ?? null;
  }
}
