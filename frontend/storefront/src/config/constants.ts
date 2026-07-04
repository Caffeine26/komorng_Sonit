// App-wide constants. Anything that's a fixed value used in more than one
// place lives here so there's a single grep target.

export const SUPPORTED_LOCALES = ['en', 'km'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'km';

export const APP_NAME = 'Komorng Storefront';
