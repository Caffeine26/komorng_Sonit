export interface FacebookUserResponse {
  id: string;
  name?: string;
  email?: string;
  picture?: {
    data?: {
      url?: string;
    }
  };
}

export const FACEBOOK_AUTH_SERVICE_PORT = Symbol('FACEBOOK_AUTH_SERVICE_PORT');

export interface IFacebookAuthService {
  verifyAndGetUser(accessToken: string): Promise<FacebookUserResponse>;
}
