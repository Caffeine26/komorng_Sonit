import { Injectable } from '@nestjs/common';
import { StorefrontTelegramLoginUseCase } from '../../../../domains/auth/application/use-cases/storefront-telegram-login.use-case';
import { 
  storefrontTelegramLoginRequestSchema, 
  StorefrontTelegramLoginResponse 
} from '@xfos/contracts-bff-storefront';
import { ValidationError } from '../../../../shared/errors/domain-error';

@Injectable()
export class TelegramLoginBffUseCase {
  constructor(
    private readonly telegramLoginUseCase: StorefrontTelegramLoginUseCase,
  ) {}

  async execute(input: unknown): Promise<StorefrontTelegramLoginResponse> {
    // 1. Zod Validation (Contract Boundary)
    const result = storefrontTelegramLoginRequestSchema.safeParse(input);
    if (!result.success) {
      throw new ValidationError(`Invalid login payload: ${result.error.message}`);
    }

    const { tenantSlug, telegramData, sessionId } = result.data;

    // 2. Delegate to Domain Application Use Case
    const loginResult = await this.telegramLoginUseCase.execute(tenantSlug, telegramData, sessionId);

    // 3. Map to BFF Response Contract
    return {
      accessToken: loginResult.accessToken,
      refreshToken: loginResult.rawRefreshToken,
      user: {
        id: loginResult.user.id,
        email: loginResult.user.email,
        fullName: loginResult.user.fullName,
        avatarUrl: loginResult.user.avatarUrl,
        tenantId: loginResult.user.tenantId,
        tenantSlug: loginResult.user.tenantSlug,
      }
    };
  }
}
