import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { INotificationRepository } from '../../core/ports/notification.repository.port';

@Injectable()
export class PrismaNotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getTelegramIdByUserId(userId: string): Promise<string | null> {
    const provider = await this.prisma.userAuthProvider.findFirst({
      where: {
        userId,
        provider: 'TELEGRAM',
      },
    });

    return provider?.providerId || null;
  }
}
