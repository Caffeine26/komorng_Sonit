import { Controller, Post, Body, HttpCode, HttpStatus, Res, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { TelegramLoginBffUseCase } from '../application/use-cases/telegram-login.bff-use-case';
import { RefreshUseCase } from '../../../domains/auth/application/use-cases/refresh.use-case';
import { LogoutUseCase } from '../../../domains/auth/application/use-cases/logout.use-case';
import { StorefrontTelegramLoginResponse } from '@xfos/contracts-bff-storefront';
import { Public } from '../../../shared/guards/public.decorator';

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

@Controller('storefront/auth')
export class StorefrontAuthController {
  constructor(
    private readonly telegramLoginBffUseCase: TelegramLoginBffUseCase,
    private readonly refreshUseCase: RefreshUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  @Public()
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  async loginWithTelegram(
    @Body() body: any,
    @Res({ passthrough: true }) res: any,
  ): Promise<StorefrontTelegramLoginResponse> {
    const result = await this.telegramLoginBffUseCase.execute(body);
    
    // Set cookies so session persists across refresh
    res.cookie('refresh_token', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.cookie('accessToken', result.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
    
    return result;
  }
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: any, @Res({ passthrough: true }) response: any, @Body() body: any) {
      const rawRefreshToken = req.cookies['refresh_token'];
      const sessionId = body?.sessionId;

      if (!rawRefreshToken && !sessionId) {
          return { accessToken: null, user: null };
      }

      let result = null;

      if (rawRefreshToken) {
          try {
              result = await this.refreshUseCase.execute(rawRefreshToken);
          } catch (e) {
              // Ignore refresh error, fallback to sessionId if available
          }
      }

      if (!result && sessionId) {
          result = await this.refreshUseCase.loginBySessionId(sessionId);
      }

      if (!result) {
          response.clearCookie('refresh_token', REFRESH_COOKIE_OPTIONS);
          response.clearCookie('accessToken', ACCESS_TOKEN_COOKIE_OPTIONS);
          return { accessToken: null, user: null };
      }

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
