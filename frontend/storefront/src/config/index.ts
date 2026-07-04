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
  storefrontApiUrl: requireEnv('NEXT_PUBLIC_STOREFRONT_API_URL', process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'),

  // App identity
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'XFOS Storefront',
  appEnv:  process.env.NEXT_PUBLIC_APP_ENV  ?? 'development',
  isDev:   process.env.NODE_ENV === 'development',
} as const

export type AppConfig = typeof config
