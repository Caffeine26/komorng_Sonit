/**
 * Port for the refresh token repository.
 * The raw refresh token is NEVER stored — only its SHA-256 hex hash.
 */
export interface RefreshTokenData {
    id: string;
    userId: string;
    tenantId: string | null;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
}

export interface CreateRefreshTokenInput {
    userId: string;
    tenantId: string | null;
    tokenHash: string;
    expiresAt: Date;
}

export interface RefreshTokenRepositoryPort {
    create(input: CreateRefreshTokenInput): Promise<RefreshTokenData>;

    /** Look up a token by its SHA-256 hash. Returns null if not found. */
    findByHash(tokenHash: string): Promise<RefreshTokenData | null>;

    /** Delete (revoke) a token by hash. Used on logout and rotation. */
    deleteByHash(tokenHash: string): Promise<void>;

    /** Delete ALL tokens for a user (global logout). */
    deleteByUserId(userId: string): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY_PORT = Symbol('REFRESH_TOKEN_REPOSITORY_PORT');
