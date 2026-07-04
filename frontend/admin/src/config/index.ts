// config/index.ts
// THE ONLY FILE THAT READS process.env
// Every other file imports from here — never directly from process.env

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] || fallback
  if (!value) {
    throw new Error(
      `[Config] Missing required environment variable: "${key}"\n` +
      `Add it to your .env.local file.`
    )
  }
  return value
}

export const config = {
  // API base URLs — admin reads bff-admin, storefront reads bff-storefront
  // We fall back to NEXT_PUBLIC_API_BASE_URL for backward compatibility with the old env.ts
  adminApiUrl: process.env.NEXT_PUBLIC_ADMIN_API_URL ?? '',
  storefrontApiUrl: process.env.NEXT_PUBLIC_STOREFRONT_API_URL ?? '',
  storefrontUrl: process.env.NEXT_PUBLIC_STOREFRONT_URL ?? 'http://localhost:3000',
  // App identity
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Komorng Admin',
  appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
  isDev: process.env.NODE_ENV === 'development',

  // Auth Config
  telegramBotName: process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || 'notification_kamangbot',
  telegramBotId: process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID || '',
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
  facebookAppId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '970646662467313',
} as const

export type AppConfig = typeof config
