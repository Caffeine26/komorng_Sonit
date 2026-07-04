import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { UserEntity } from '../../core/entities/user.entity';
import { UserRepositoryPort } from '../../core/ports/user.repository.port';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
    constructor(private readonly prisma: PrismaService) { }

    async findByEmail(email: string): Promise<UserEntity | null> {
        const user = await this.prisma.user.findUnique({
            where: { email },
            include: {
                roles: true,
                authProviders: {
                    where: { provider: 'PASSWORD' as any },
                },
            },
        });

        if (!user) return null;

        return UserEntity.rehydrate({
            id: user.id,
            email: user.email!,
            fullName: user.fullName,
            status: user.status,
            passwordHash: (user.authProviders[0]?.metadata as any)?.passwordHash ?? null,
            roles: user.roles.map((r) => ({ role: r.role, tenantId: r.tenantId })),
            avatarUrl: user.avatarUrl,
            phone: user.phone,
        });
    }

    async findById(id: string): Promise<UserEntity | null> {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: { roles: true },
        });

        if (!user) return null;

        return UserEntity.rehydrate({
            id: user.id,
            email: user.email!,
            fullName: user.fullName,
            status: user.status,
            passwordHash: null,
            roles: user.roles.map((r) => ({ role: r.role, tenantId: r.tenantId })),
            avatarUrl: user.avatarUrl,
            phone: user.phone,
        });
    }

    async findByProviderId(provider: 'TELEGRAM' | 'PASSWORD' | 'GOOGLE' | 'FACEBOOK', providerId: string): Promise<UserEntity | null> {
        // We use 'as any' here to solve the Prisma Enum conflict
        const record = await this.prisma.user.findFirst({
            where: {
                authProviders: {
                    some: {
                        provider: provider as any,
                        providerId
                    }
                }
            },
            include: { roles: true }, // <--- THIS LINE IS CRITICAL
        });

        if (!record) return null;

        return UserEntity.rehydrate({
            id: record.id,
            email: record.email,
            fullName: record.fullName,
            status: record.status,
            passwordHash: null,
            roles: (record as any).roles.map((r: any) => ({ role: r.role, tenantId: r.tenantId })),
            avatarUrl: record.avatarUrl,
            phone: record.phone,
        });
    }

    async create(user: UserEntity, auth: {
        provider: 'TELEGRAM' | 'PASSWORD' | 'GOOGLE' | 'FACEBOOK';
        providerId: string;
        displayName?: string;
    }): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            // 1. Create the base User
            await tx.user.create({
                data: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    status: user.status as any,
                }
            });

            // 2. Link the Auth Provider
            await tx.userAuthProvider.create({
                data: {
                    userId: user.id,
                    provider: auth.provider as any,
                    providerId: auth.providerId,
                    displayName: auth.displayName,
                    metadata: {},
                }
            });
        });
    }

    async linkProvider(userId: string, auth: {
        provider: 'TELEGRAM' | 'PASSWORD' | 'GOOGLE' | 'FACEBOOK';
        providerId: string;
        displayName?: string;
    }): Promise<void> {
        await this.prisma.userAuthProvider.create({
            data: {
                userId,
                provider: auth.provider as any,
                providerId: auth.providerId,
                displayName: auth.displayName,
                metadata: {},
            }
        });
    }

    async updateEmail(userId: string, email: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { email },
        });
    }

    async updatePhone(userId: string, phone: string | null): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { phone },
        });
    }
}
