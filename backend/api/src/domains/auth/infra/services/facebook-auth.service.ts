import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IFacebookAuthService, FacebookUserResponse } from '../../core/ports/facebook-auth.service.port';

@Injectable()
export class FacebookAuthService implements IFacebookAuthService {
  async verifyAndGetUser(accessToken: string): Promise<FacebookUserResponse> {
    try {
      const baseUrl = process.env.FACEBOOK_API_URL || 'https://graph.facebook.com';
      const response: any = await fetch(`${baseUrl}/me?fields=id,name,email,picture&access_token=${accessToken}`);
      if (!response.ok) {
        throw new Error('Failed to fetch user from Facebook');
      }
      return await response.json() as FacebookUserResponse;
    } catch (error) {
      throw new UnauthorizedException('Invalid Facebook token');
    }
  }
}
