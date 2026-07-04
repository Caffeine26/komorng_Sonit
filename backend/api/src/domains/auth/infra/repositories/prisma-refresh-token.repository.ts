import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
    CreateRefreshTokenInput,
    RefreshTokenData,
    RefreshTokenRepositoryPort,
} from '../../core/ports/refresh-token.repository.port';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepositoryPort {
    constructor(private readonly prisma: PrismaService) { }

    async create(input: CreateRefreshTokenInput): Promise<RefreshTokenData> {
        return this.prisma.refreshToken.create({
            data: {
                userId: input.userId,
                tenantId: input.tenantId,
                tokenHash: input.tokenHash,
                expiresAt: input.expiresAt,
            },
        }) as unknown as RefreshTokenData;
    }

    async findByHash(tokenHash: string): Promise<RefreshTokenData | null> {
        const token = await this.prisma.refreshToken.findUnique({
            where: { tokenHash },
        });
        if (!token) return null;
        return token as unknown as RefreshTokenData;
    }

    async deleteByHash(tokenHash: string): Promise<void> {
        await this.prisma.refreshToken.delete({ where: { tokenHash } }).catch(() => { });
    }

    async deleteByUserId(userId: string): Promise<void> {
        await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }
}
