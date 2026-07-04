import { Inject, Injectable } from '@nestjs/common';
import {
    RefreshTokenRepositoryPort,
    REFRESH_TOKEN_REPOSITORY_PORT,
} from '../../core/ports/refresh-token.repository.port';
import { hashRefreshToken } from './login-with-telegram.use-case';

@Injectable()
export class LogoutUseCase {
    constructor(
        @Inject(REFRESH_TOKEN_REPOSITORY_PORT)
        private readonly refreshRepo: RefreshTokenRepositoryPort,
    ) { }

    async execute(rawToken: string): Promise<void> {
        const tokenHash = hashRefreshToken(rawToken);
        await this.refreshRepo.deleteByHash(tokenHash);
    }
}
