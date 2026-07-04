import { apiFetch } from './client';

/**
 * Authentication & Onboarding API
 * [Squad Protocol] Logic for Telegram login and Merchant registration.
 */

export async function loginWithTelegram(user: any, token?: string): Promise<any> {
  return apiFetch('/api/v1/admin/auth/telegram', {
    method: 'POST',
    body: user,
    token
  });
}


export async function signupWithTelegram(user: any, token?: string): Promise<any> {
  return apiFetch('/api/v1/admin/auth/register/telegram', {
    method: 'POST',
    body: user,
    token
  });
}

export async function registerTenant(data: any, token?: string): Promise<any> {
  return apiFetch('/api/v1/admin/tenants/register', {
    method: 'POST',
    body: data,
    token
  });
}

export async function logout(token?: string): Promise<any> {
  return apiFetch('/api/v1/admin/auth/logout', {
    method: 'POST',
    token
  });
}

export async function acceptInvitation(inviteId: string, telegramData: any, token?: string): Promise<any> {
  return apiFetch('/api/v1/admin/auth/accept-invite', {
    method: 'POST',
    body: { inviteId, telegramData },
    token
  });
}

export async function loginWithFacebook(facebookAccessToken: string, token?: string): Promise<any> {
  return apiFetch('/api/v1/admin/auth/facebook', {
    method: 'POST',
    body: { facebookAccessToken },
    token
  });
}

export async function registerWithFacebook(facebookAccessToken: string, token?: string): Promise<any> {
  return apiFetch('/api/v1/admin/auth/facebook/register', {
    method: 'POST',
    body: { facebookAccessToken },
    token
  });
}

export async function sendTelegramOtp(telegramIdentifier: string, token?: string): Promise<any> {
  return apiFetch('/api/v1/admin/auth/telegram-otp/send', {
    method: 'POST',
    body: { telegramIdentifier },
    token
  });
}

export async function linkFacebookToTelegram(facebookAccessToken: string, telegramIdentifier: string, otp: string, token?: string): Promise<any> {
  return apiFetch('/api/v1/admin/auth/facebook/link', {
    method: 'POST',
    body: { facebookAccessToken, telegramIdentifier, otp },
    token
  });
}

export async function linkFacebookWithTelegramOAuth(facebookAccessToken: string, telegramData: any, token?: string): Promise<any> {
  return apiFetch('/api/v1/admin/auth/facebook/link-oauth', {
    method: 'POST',
    body: { facebookAccessToken, telegramData },
    token
  });
}
