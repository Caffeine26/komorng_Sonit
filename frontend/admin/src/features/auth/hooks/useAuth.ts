import { useState, useCallback, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { loginWithTelegram, signupWithTelegram, registerTenant, logout, acceptInvitation } from '@/lib/api/auth.api';
import { signIn, signOut, useSession } from 'next-auth/react';
import { config } from '@/config';

/**
 * useAuth Hook
 * [Squad Protocol] Logic for authentication and session management.
 */
export function useAuth() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const inviteId = searchParams?.get('inviteId');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: session, status } = useSession();

  const user = session ? {
    ...(session.user || {}),
    tenantId: (session as any).tenantId,
    tenantSlug: (session as any).tenantSlug,
    role: (session as any).role,
    tenantStatus: (session as any).tenantStatus,
  } : null;

  // PHASE 1: Expose account not found state
  const isAccountNotFound = (session as any)?.error === 'ACCOUNT_NOT_FOUND';
  const facebookAccessToken = (session as any)?.facebookAccessToken;
  const facebookData = (session as any)?.facebookData;

  const handleTelegramAuth = useCallback(async (user: any) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = inviteId
        ? await acceptInvitation(inviteId, user)
        : await loginWithTelegram(user);

      const signInResult = await signIn('credentials', {
        accessToken: result.accessToken,
        user: JSON.stringify(result.user),
        redirect: false,
      });

      if (signInResult?.error) {
        throw new Error('Failed to create local session');
      }

      // ONLY show Under Review if the user HAS a tenant and it is NOT active
      const isUnderReview = result.user.tenantId && result.user.tenantStatus !== 'ACTIVE';

      if (isUnderReview) {
        throw new Error('Your store application is currently under review. Our team will notify you via Telegram once it is approved!');
      }

      // If they have no tenant and no roles, they are a fresh user - take them to onboarding
      if (!result.user.tenantId && (!result.user.roles || result.user.roles.length === 0)) {
        router.push(`/auth/signup`);
        return;
      }

      // If they have an active tenant, take them to the dashboard
      if (result.user.tenantId && result.user.tenantSlug) {
        router.push(`/${result.user.tenantSlug}`);
        return;
      }

      router.push(`/select-tenant`);
    } catch (err: any) {
      console.error('[TelegramAuth] Login failed:', err);
      const msg = Array.isArray(err.message) ? err.message[0] : (err.message || 'Authentication failed');
      setError(msg);
      setIsLoading(false);
    }
  }, [router, inviteId]);

  // Load Facebook SDK
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ((window as any).FB) return; // Already loaded

    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId: config.facebookAppId,
        cookie: true,
        xfbml: true,
        version: 'v18.0',
      });
    };

    if (document.getElementById('facebook-jssdk')) return;

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);
  }, []);

  const handleFacebookAuth = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).FB) {
      setError('Facebook SDK is still loading, please try again in a moment.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const processToken = (token: string) => {
      import('@/lib/api/auth.api').then(async m => {
        try {
          console.log('[useAuth] Calling loginWithFacebook API...');
          const result = await m.loginWithFacebook(token);
          console.log('[useAuth] loginWithFacebook API Result:', result);

          if (result.status === 'ACCOUNT_NOT_FOUND') {
            console.log('[useAuth] Status is ACCOUNT_NOT_FOUND. Calling signIn with error...');
            await signIn('credentials', {
              accessToken: token,
              user: JSON.stringify({ error: 'ACCOUNT_NOT_FOUND', facebookData: result.facebookData }),
              redirect: false,
            });
            setIsLoading(false);
            return;
          }

          const signInResult = await signIn('credentials', {
            accessToken: result.accessToken,
            user: JSON.stringify(result.user),
            redirect: false,
          });

          if (signInResult?.error) {
            throw new Error('Failed to create local session');
          }

          if (result.user.tenantId && result.user.tenantSlug) {
            router.push(`/${result.user.tenantSlug}`);
          } else if (!result.user.tenantId && (!result.user.roles || result.user.roles.length === 0)) {
            router.push(`/auth/signup`);
          } else {
            setIsLoading(false);
          }
        } catch (err: any) {
          console.error('[FacebookAuth] Login API failed:', err);
          setError(err.message || 'Facebook authentication failed');
          setIsLoading(false);
        }
      });
    };

    (window as any).FB.getLoginStatus((response: any) => {
      console.log('[Facebook SDK] getLoginStatus response:', response);

      if (response.status === 'connected' && response.authResponse) {
        console.log('[Facebook SDK] User already connected, bypassing popup!');
        processToken(response.authResponse.accessToken);
      } else {
        console.warn(`[Facebook SDK] Status is '${response.status}'. Browser might be blocking 3rd-party cookies. Falling back to popup...`);
        (window as any).FB.login((loginResponse: any) => {
          if (loginResponse.authResponse) {
            processToken(loginResponse.authResponse.accessToken);
          } else {
            setError('User cancelled login or did not fully authorize.');
            setIsLoading(false);
          }
        }, { scope: 'public_profile,email' });
      }
    });
  }, [router]);

  const handleFacebookRegister = useCallback(async () => {
    if (!facebookAccessToken) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await import('@/lib/api/auth.api').then(m => m.registerWithFacebook(facebookAccessToken));

      const signInResult = await signIn('credentials', {
        accessToken: result.accessToken,
        user: JSON.stringify(result.user),
        redirect: false,
      });

      if (signInResult?.error) {
        throw new Error('Failed to create local session');
      }

      // Fresh user, go to signup
      router.push(`/auth/signup`);
    } catch (err: any) {
      console.error('[FacebookAuth] Registration failed:', err);
      setError(err.message || 'Facebook registration failed');
      setIsLoading(false);
    }
  }, [facebookAccessToken, router]);

  const handleSendTelegramOtp = useCallback(async (telegramIdentifier: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await import('@/lib/api/auth.api').then(m => m.sendTelegramOtp(telegramIdentifier));
      setIsLoading(false);
      return true;
    } catch (err: any) {
      console.error('[FacebookLink] Send OTP failed:', err);
      setError(err.message || 'Failed to send OTP. Please check your Telegram username.');
      setIsLoading(false);
      return false;
    }
  }, []);

  const handleLinkFacebook = useCallback(async (telegramIdentifier: string, otp: string) => {
    if (!facebookAccessToken) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await import('@/lib/api/auth.api').then(m => m.linkFacebookToTelegram(facebookAccessToken, telegramIdentifier, otp));

      const signInResult = await signIn('credentials', {
        accessToken: result.accessToken,
        user: JSON.stringify(result.user),
        redirect: false,
      });

      if (signInResult?.error) {
        throw new Error('Failed to create local session');
      }

      // If they have an active tenant, take them to the dashboard
      if (result.user.tenantId && result.user.tenantSlug) {
        router.push(`/${result.user.tenantSlug}`);
        return;
      }

      router.push(`/select-tenant`);
    } catch (err: any) {
      console.error('[FacebookLink] Linking failed:', err);
      setError(err.message || 'Failed to link account');
      setIsLoading(false);
    }
  }, [facebookAccessToken, router]);

  const handleLinkFacebookOAuth = useCallback(async (telegramData: any) => {
    if (!facebookAccessToken) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await import('@/lib/api/auth.api').then(m => m.linkFacebookWithTelegramOAuth(facebookAccessToken, telegramData));

      const signInResult = await signIn('credentials', {
        accessToken: result.accessToken,
        user: JSON.stringify(result.user),
        redirect: false,
      });

      if (signInResult?.error) {
        throw new Error('Failed to create local session');
      }

      // If they have an active tenant, take them to the dashboard
      if (result.user.tenantId && result.user.tenantSlug) {
        router.push(`/${result.user.tenantSlug}`);
        return;
      }

      router.push(`/auth/signup`);
    } catch (err: any) {
      console.error('[FacebookLinkOAuth] Linking failed:', err);
      setError(err.message || 'Failed to link account with Telegram');
      setIsLoading(false);
    }
  }, [facebookAccessToken, router]);

  // TODO: MVP — implement Phone-OTP login
  // Docs reference: authentication-strategy-v2.md UC-6, phone_otp_attempts table
  // Required: SMS gateway (Twilio), phone input UI, OTP verification endpoint
  const handlePhoneOTPAuth = useCallback(async (_phone: string, _otp: string) => {
    throw new Error('Phone-OTP auth not yet implemented');
  }, []);

  const handleTelegramSignup = async (user: any) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await signupWithTelegram(user);

      const signInResult = await signIn('credentials', {
        accessToken: result.accessToken,
        user: JSON.stringify(result.user),
        redirect: false,
      });

      if (signInResult?.error) {
        throw new Error('Failed to create local session');
      }

      // If they already have a tenant, redirect them appropriately
      if (result.user.tenantId) {
        if (result.user.tenantStatus === 'ACTIVE' && result.user.tenantSlug) {
          router.push(`/${result.user.tenantSlug}`);
        } else {
          // If not active, sending them to login will show the "Under Review" error
          router.push(`/auth/login`);
        }
        return false; // Don't proceed to next step in SignupPage
      }

      setIsLoading(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Signup failed');
      setIsLoading(false);
      return false;
    }
  };

  const handleRegisterTenant = async (data: any) => {
    setIsLoading(true);
    setError(null);

    try {
      await registerTenant(data);
      // On success, the component handles the "isSubmitted" state
      return true;
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      setIsLoading(false);
      return false;
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      // 1. Call backend to invalidate session
      await logout().catch(err => console.error('API Logout failed:', err));

      // 2. Clear local session and redirect
      await signOut({ callbackUrl: `/auth/login` });
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelSocialLogin = async () => {
    setIsLoading(true);
    await signOut({ redirect: false });
    setIsLoading(false);
  };



  return {
    handleTelegramAuth,
    handleFacebookAuth,
    handleFacebookRegister,
    handleSendTelegramOtp,
    handleLinkFacebook,
    handleLinkFacebookOAuth,
    handlePhoneOTPAuth,
    handleTelegramSignup,
    handleRegisterTenant,
    handleLogout,
    cancelSocialLogin,
    isLoading,
    error,
    setError,
    user,
    isAccountNotFound,
    facebookAccessToken,
    facebookData
  };
}
