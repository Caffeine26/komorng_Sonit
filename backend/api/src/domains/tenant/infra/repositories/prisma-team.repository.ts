import { Injectable } from '@nestjs/common';
import { ITeamRepository } from '../../core/ports/team.repository.port';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

@Injectable()
export class PrismaTeamRepository implements ITeamRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRole(tenantId: string, userId: string): Promise<any | null> {
    return this.prisma.userRole.findFirst({
      where: { tenantId, userId },
    });
  }

  async findRoleByTelegramUsername(tenantId: string, username: string): Promise<any | null> {
    return this.prisma.userRole.findFirst({
      where: {
        tenantId,
        user: {
          authProviders: {
            some: {
              provider: 'TELEGRAM' as any,
              displayName: { equals: username, mode: 'insensitive' },
            },
          },
        },
      },
    });
  }

  async findManyRoles(tenantId: string): Promise<any[]> {
    return this.prisma.userRole.findMany({
      where: { tenantId },
      include: { 
        user: {
          include: {
            authProviders: true
          }
        } 
      },
    });
  }

  async createRole(tenantId: string, data: any): Promise<any> {
    return this.prisma.userRole.create({
      data: { ...data, tenantId },
    });
  }

  async updateRole(tenantId: string, userId: string, roleData: any): Promise<void> {
    await this.prisma.userRole.updateMany({
      where: { tenantId, userId },
      data: roleData,
    });
  }

  async updateUserAndRole(tenantId: string, userId: string, userData: any, roleData: any): Promise<void> {
    await this.prisma.$transaction(async (tx: any) => {
      await tx.user.update({
        where: { id: userId },
        data: userData,
      });
      await tx.userRole.updateMany({
        where: { tenantId, userId },
        data: roleData,
      });
    });
  }

  async deleteRole(tenantId: string, userId: string): Promise<void> {
    await this.prisma.userRole.deleteMany({
      where: { tenantId, userId },
    });
  }

  async findInvitationByEmail(tenantId: string, email: string): Promise<any | null> {
    return this.prisma.invitation.findFirst({
      where: { tenantId, email },
    });
  }

  async findPendingInvitationByChannelId(tenantId: string, channelId: string): Promise<any | null> {
    return this.prisma.invitation.findFirst({
      where: {
        tenantId,
        channelId,
        status: 'PENDING',
        expiresAt: { gte: new Date() },
      },
    });
  }

  async findInvitationById(tenantId: string, id: string): Promise<any | null> {
    return this.prisma.invitation.findFirst({
      where: { tenantId, id },
    });
  }

  async findManyInvitations(tenantId: string): Promise<any[]> {
    return this.prisma.invitation.findMany({
      where: { tenantId, status: 'PENDING' },
    });
  }

  async createInvitation(tenantId: string, data: any): Promise<any> {
    return this.prisma.invitation.create({
      data: { ...data, tenantId },
    });
  }

  async updateInvitation(tenantId: string, id: string, data: any): Promise<void> {
    await this.prisma.invitation.update({
      where: { tenantId_id: { tenantId, id } },
      data,
    });
  }

  async findTenant(tenantId: string): Promise<any | null> {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
  }

  async findTelegramProviderByUsername(username: string): Promise<any | null> {
    return this.prisma.userAuthProvider.findFirst({
      where: {
        provider: 'TELEGRAM',
        displayName: { equals: username, mode: 'insensitive' },
      },
    });
  }
}
