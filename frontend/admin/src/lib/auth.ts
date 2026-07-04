import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import FacebookProvider from 'next-auth/providers/facebook';
import { env } from '@/config/env';

export const authOptions: NextAuthOptions = {
  providers: [
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID || '',
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        accessToken: { label: 'Token', type: 'text' },
        user: { label: 'User', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.accessToken || !credentials?.user) {
          return null;
        }

        const userObj = JSON.parse(credentials.user);
        
        // Return object must have `id` for NextAuth User type, plus any custom fields
        return {
          id: userObj.id || 'temp-id',
          accessToken: credentials.accessToken,
          tenantId: userObj.tenantId,
          tenantSlug: userObj.tenantSlug,
          role: userObj.roles?.[0] || userObj.role,
          error: userObj.error,
          facebookData: userObj.facebookData,
          facebookAccessToken: credentials.accessToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      // Intercept Facebook provider and exchange token with our backend
      if (account?.provider === 'facebook' && account.access_token) {
        try {
          const baseUrl = env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:4000';
          const res = await fetch(`${baseUrl}/api/v1/admin/auth/facebook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ facebookAccessToken: account.access_token }),
          });
          
          if (res.ok) {
            const data = await res.json();
            return {
              ...token,
              accessToken: data.accessToken,
              tenantId: data.user?.tenantId,
              tenantSlug: data.user?.tenantSlug,
              role: data.user?.role,
              expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
            };
          } else {
            console.error('Facebook auth exchange failed', await res.text());
          }
        } catch (error) {
          console.error('Facebook auth exchange error', error);
        }
      }

      // Initial sign in for Credentials
      if (user) {
        return {
          ...token,
          accessToken: (user as any).accessToken,
          tenantId: (user as any).tenantId,
          tenantSlug: (user as any).tenantSlug,
          role: (user as any).role,
          error: (user as any).error,
          facebookData: (user as any).facebookData,
          facebookAccessToken: (user as any).facebookAccessToken,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        };
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < (token.expiresAt as number)) {
        return token;
      }

      // Access token has expired — signal the client to re-authenticate
      return { ...token, error: 'RefreshAccessTokenError' };
    },
    async session({ session, token }) {
      // Send properties to the client
      (session as any).token = token.accessToken;
      (session as any).tenantId = token.tenantId;
      (session as any).tenantSlug = token.tenantSlug;
      (session as any).role = token.role;
      (session as any).error = token.error;
      (session as any).facebookData = token.facebookData;
      (session as any).facebookAccessToken = token.facebookAccessToken;
      
      return session;
    },
  },
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/login', // Fallback login path
  },
};
