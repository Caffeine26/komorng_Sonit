
/**
 * User aggregate. Pure TypeScript — no NestJS, no Prisma.
 * Password verification is done here; the hash is always stored in
 * UserAuthProvider.metadata.passwordHash (provider = PASSWORD).
 */
export class UserEntity {
    public constructor(
        public readonly id: string,
        public readonly email: string | null,
        public readonly fullName: string | null,
        public readonly status: string,
        /** Argon2id hash from UserAuthProvider.metadata.passwordHash. */
        public readonly passwordHash: string | null,
        /** Roles the user holds, with associated tenantId. */
        public readonly roles: ReadonlyArray<{ role: string; tenantId: string | null }>,
        public readonly avatarUrl?: string | null,
        public readonly phone?: string | null,
    ) { }

    static create(props: {
        id?: string;
        email?: string | null;
        fullName?: string | null;
        status?: string;
        roles?: ReadonlyArray<{ role: string; tenantId: string | null }>;
        passwordHash?: string | null;
        avatarUrl?: string | null;
        phone?: string | null;
    }): UserEntity {
        return new UserEntity(
            props.id || crypto.randomUUID(),
            props.email || null,
            props.fullName || null,
            props.status || 'ACTIVE',
            props.passwordHash || null,
            props.roles || [],
            props.avatarUrl,
            props.phone,
        );
    }

    static rehydrate(props: {
        id: string;
        email: string | null;
        fullName: string | null;
        status: string;
        passwordHash: string | null;
        roles: Array<{ role: string; tenantId: string | null }>;
        avatarUrl?: string | null;
        phone?: string | null;
    }): UserEntity {
        return new UserEntity(
            props.id,
            props.email,
            props.fullName,
            props.status,
            props.passwordHash,
            props.roles,
            props.avatarUrl,
            props.phone,
        );
    }


    get isActive(): boolean {
        return this.status === 'ACTIVE';
    }

    /**
     * Returns the tenantId to embed in the JWT based on role priority.
     */
    resolvePrimaryTenantId(): string {
        const kitchenRole = this.roles.find(
            (r) => r.role === 'KITCHEN_STAFF' && r.tenantId !== null,
        );
        if (kitchenRole?.tenantId) return kitchenRole.tenantId;

        const tenantRoles = this.roles.filter((r) => r.tenantId !== null);
        if (tenantRoles.length === 0) {
            throw new Error(`User ${this.id} has no tenant-scoped roles`);
        }
        return tenantRoles[tenantRoles.length - 1]!.tenantId!;
    }

    /** All distinct roles for JWT payload. */
    get roleNames(): string[] {
        return [...new Set(this.roles.map((r) => r.role))];
    }
}
