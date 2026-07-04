import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Domain: Use Cases

import { RefreshUseCase } from '../../domains/auth/application/use-cases/refresh.use-case';
import { LogoutUseCase } from '../../domains/auth/application/use-cases/logout.use-case';
import { LoginWithTelegramUseCase } from '../../domains/auth/application/use-cases/login-with-telegram.use-case';
import { RegisterWithTelegramUseCase } from '../../domains/auth/application/use-cases/register-with-telegram.use-case';
import { LoginWithFacebookUseCase } from '../../domains/auth/application/use-cases/login-with-facebook.use-case';
import { RegisterWithFacebookUseCase } from '../../domains/auth/application/use-cases/register-with-facebook.use-case';
import { SendTelegramOtpUseCase } from '../../domains/auth/application/use-cases/send-telegram-otp.use-case';
import { LinkFacebookToTelegramUseCase } from '../../domains/auth/application/use-cases/link-facebook-to-telegram.use-case';
import { StorefrontTelegramLoginUseCase } from '../../domains/auth/application/use-cases/storefront-telegram-login.use-case';
import { UpdatePhoneFromTelegramUseCase } from '../../domains/auth/application/use-cases/update-phone-from-telegram.use-case';

import { AcceptInvitationUseCase } from '../../domains/auth/application/use-cases/accept-invitation.use-case';

// Domain: Repository Ports
import { USER_REPOSITORY_PORT } from '../../domains/auth/core/ports/user.repository.port';
import { REFRESH_TOKEN_REPOSITORY_PORT } from '../../domains/auth/core/ports/refresh-token.repository.port';
import { AUTH_ONBOARDING_REPOSITORY_PORT } from '../../domains/auth/core/ports/auth-onboarding.repository.port';
import { FACEBOOK_AUTH_SERVICE_PORT } from '../../domains/auth/core/ports/facebook-auth.service.port';

// Infra: Prisma Implementations
import { PrismaUserRepository } from '../../domains/auth/infra/repositories/prisma-user.repository';
import { PrismaRefreshTokenRepository } from '../../domains/auth/infra/repositories/prisma-refresh-token.repository';
import { PrismaAuthOnboardingRepository } from '../../domains/auth/infra/repositories/prisma-auth-onboarding.repository';
import { FacebookAuthService } from '../../domains/auth/infra/services/facebook-auth.service';


// Shared Guards
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';

// Dependencies
import { TenantModule } from '../../domains/tenant/tenant.module';
import { NotificationModule } from '../../domains/notification/notification.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';



@Module({
    imports: [
        ConfigModule,
        TenantModule,
        NotificationModule,
        PrismaModule,

        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const secret = config.get<string>('JWT_SECRET');
                if (!secret) {
                    throw new Error(
                        'JWT_SECRET env var is required but not set.',
                    );
                }
                return { secret };
            },
        }),
    ],
    controllers: [],
    providers: [
        // Use Cases

        RefreshUseCase,
        LogoutUseCase,
        LoginWithTelegramUseCase,
        RegisterWithTelegramUseCase,
        LoginWithFacebookUseCase,
        RegisterWithFacebookUseCase,
        SendTelegramOtpUseCase,
        LinkFacebookToTelegramUseCase,
        StorefrontTelegramLoginUseCase,
        UpdatePhoneFromTelegramUseCase,

        AcceptInvitationUseCase,

        // Repository bindings
        {
            provide: USER_REPOSITORY_PORT,
            useClass: PrismaUserRepository,
        },
        {
            provide: REFRESH_TOKEN_REPOSITORY_PORT,
            useClass: PrismaRefreshTokenRepository,
        },
        {
            provide: AUTH_ONBOARDING_REPOSITORY_PORT,
            useClass: PrismaAuthOnboardingRepository,
        },
        {
            provide: FACEBOOK_AUTH_SERVICE_PORT,
            useClass: FacebookAuthService,
        },

        // Guards
        JwtAuthGuard,
        RolesGuard,
    ],
    exports: [
        JwtModule,
        USER_REPOSITORY_PORT,
        REFRESH_TOKEN_REPOSITORY_PORT,
        AUTH_ONBOARDING_REPOSITORY_PORT,

        // Use Cases

        RefreshUseCase,
        LogoutUseCase,
        LoginWithTelegramUseCase,
        RegisterWithTelegramUseCase,
        LoginWithFacebookUseCase,
        RegisterWithFacebookUseCase,
        SendTelegramOtpUseCase,
        LinkFacebookToTelegramUseCase,
        StorefrontTelegramLoginUseCase,
        UpdatePhoneFromTelegramUseCase,

        AcceptInvitationUseCase,

        // Guards
        JwtAuthGuard,
        RolesGuard,
    ],
})
export class AuthModule { }
