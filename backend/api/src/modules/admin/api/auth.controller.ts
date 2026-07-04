import { Body, Controller, HttpCode, HttpStatus, Post, Res, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { Public } from '../../../shared/guards/public.decorator';

import { LogoutUseCase } from '../../../domains/auth/application/use-cases/logout.use-case';
import { RefreshUseCase } from '../../../domains/auth/application/use-cases/refresh.use-case';
import { LoginWithTelegramUseCase } from '../../../domains/auth/application/use-cases/login-with-telegram.use-case';
import { RegisterWithTelegramUseCase } from '../../../domains/auth/application/use-cases/register-with-telegram.use-case';
import { LoginWithFacebookUseCase } from '../../../domains/auth/application/use-cases/login-with-facebook.use-case';
import { RegisterWithFacebookUseCase } from '../../../domains/auth/application/use-cases/register-with-facebook.use-case';
import { SendTelegramOtpUseCase } from '../../../domains/auth/application/use-cases/send-telegram-otp.use-case';
import { LinkFacebookToTelegramUseCase } from '../../../domains/auth/application/use-cases/link-facebook-to-telegram.use-case';

import { AcceptInvitationUseCase } from '../../../domains/auth/application/use-cases/accept-invitation.use-case';

const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const ACCESS_TOKEN_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

@Controller('admin/auth')
export class AdminAuthController {
    constructor(
        private readonly logoutUseCase: LogoutUseCase,
        private readonly refreshUseCase: RefreshUseCase,
        private readonly loginWithTelegramUseCase: LoginWithTelegramUseCase,
        private readonly registerWithTelegramUseCase: RegisterWithTelegramUseCase,
        private readonly acceptInvitationUseCase: AcceptInvitationUseCase,
        private readonly loginWithFacebookUseCase: LoginWithFacebookUseCase,
        private readonly registerWithFacebookUseCase: RegisterWithFacebookUseCase,
        private readonly sendTelegramOtpUseCase: SendTelegramOtpUseCase,
        private readonly linkFacebookToTelegramUseCase: LinkFacebookToTelegramUseCase,
    ) { }

    @Public()
    @Post('facebook')
    @HttpCode(HttpStatus.OK)
    async loginWithFacebook(@Body() body: { facebookAccessToken: string }, @Res({ passthrough: true }) response: any) {
        const result = await this.loginWithFacebookUseCase.execute(body.facebookAccessToken);

        if ((result as any).status === 'ACCOUNT_NOT_FOUND') {
            return result;
        }

        response.cookie('refresh_token', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);
        response.cookie('accessToken', result.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
        return { accessToken: result.accessToken, user: result.user };
    }

    @Public()
    @Post('facebook/register')
    @HttpCode(HttpStatus.OK)
    async registerWithFacebook(@Body() body: { facebookAccessToken: string }, @Res({ passthrough: true }) response: any) {
        const result = await this.registerWithFacebookUseCase.execute(body.facebookAccessToken);
        response.cookie('refresh_token', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);
        response.cookie('accessToken', result.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
        return { accessToken: result.accessToken, user: result.user };
    }

    @Public()
    @Post('telegram-otp/send')
    @HttpCode(HttpStatus.OK)
    async sendTelegramOtp(@Body() body: { telegramIdentifier: string }) {
        await this.sendTelegramOtpUseCase.execute(body.telegramIdentifier);
        return { success: true };
    }

    @Public()
    @Post('facebook/link')
    @HttpCode(HttpStatus.OK)
    async linkFacebook(@Body() body: { facebookAccessToken: string, telegramIdentifier: string, otp: string }, @Res({ passthrough: true }) response: any) {
        const result = await this.linkFacebookToTelegramUseCase.execute(body.facebookAccessToken, body.telegramIdentifier, body.otp);
        response.cookie('refresh_token', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);
        response.cookie('accessToken', result.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
        return { accessToken: result.accessToken, user: result.user };
    }

    @Public()
    @Post('telegram')
    @HttpCode(HttpStatus.OK)
    async loginWithTelegram(@Body() body: any, @Res({ passthrough: true }) response: any) {
        const telegramId = body.id?.toString();
        const result = await this.loginWithTelegramUseCase.execute(telegramId, body);
        response.cookie('refresh_token', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);
        response.cookie('accessToken', result.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
        return { accessToken: result.accessToken, user: result.user };
    }

    @Public()
    @Post('register/telegram')
    @HttpCode(HttpStatus.OK)
    async registerWithTelegram(@Body() body: any, @Res({ passthrough: true }) response: any) {
        const telegramId = body.id?.toString();
        const result = await this.registerWithTelegramUseCase.execute(telegramId, body);
        response.cookie('refresh_token', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);
        response.cookie('accessToken', result.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
        return { accessToken: result.accessToken, user: result.user };
    }

    @Public()
    @Post('accept-invite')
    @HttpCode(HttpStatus.OK)
    async acceptInvite(@Body() body: any, @Res({ passthrough: true }) response: any) {
        const result = await this.acceptInvitationUseCase.execute(body.inviteId, body.telegramData);
        response.cookie('refresh_token', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);
        response.cookie('accessToken', result.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
        return { accessToken: result.accessToken, user: result.user };
    }

    @Public()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Req() req: any, @Res({ passthrough: true }) response: any) {
        const rawRefreshToken = req.cookies['refresh_token'];
        if (!rawRefreshToken) {
            return { accessToken: null, user: null };
        }

        const result = await this.refreshUseCase.execute(rawRefreshToken);
        response.cookie('refresh_token', result.rawRefreshToken, REFRESH_COOKIE_OPTIONS);
        response.cookie('accessToken', result.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);

        return { accessToken: result.accessToken, user: result.user };
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Req() req: any, @Res({ passthrough: true }) response: any) {
        const rawRefreshToken = req.cookies['refresh_token'];
        if (rawRefreshToken) {
            await this.logoutUseCase.execute(rawRefreshToken);
        }
        response.clearCookie('refresh_token', REFRESH_COOKIE_OPTIONS);
        response.clearCookie('accessToken', ACCESS_TOKEN_COOKIE_OPTIONS);
        return { success: true };
    }
}
