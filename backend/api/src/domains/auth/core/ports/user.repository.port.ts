import { UserEntity } from '../entities/user.entity';

export interface UserRepositoryPort {
    /** Find a user by email, loading their PASSWORD auth provider and roles. */
    findByEmail(email: string): Promise<UserEntity | null>;

    /** Find a user by id, loading their roles. No password hash needed here. */
    findById(id: string): Promise<UserEntity | null>;
    findByProviderId(provider: 'TELEGRAM' | 'PASSWORD' | 'GOOGLE' | 'FACEBOOK', providerId: string): Promise<UserEntity | null>;

    /** Create a new user and link them to an auth provider. */
    create(user: UserEntity, auth: {
        provider: 'TELEGRAM' | 'PASSWORD' | 'GOOGLE' | 'FACEBOOK';
        providerId: string;
        displayName?: string;
    }): Promise<void>;

    /** Update a user's email address. */
    updateEmail(userId: string, email: string): Promise<void>;
    updatePhone(userId: string, phone: string | null): Promise<void>;

    /** Link an existing user to a new auth provider. */
    linkProvider(userId: string, auth: {
        provider: 'TELEGRAM' | 'PASSWORD' | 'GOOGLE' | 'FACEBOOK';
        providerId: string;
        displayName?: string;
    }): Promise<void>;
}

export const USER_REPOSITORY_PORT = Symbol('USER_REPOSITORY_PORT');
