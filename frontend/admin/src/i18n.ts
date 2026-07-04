import { getRequestConfig } from 'next-intl/server';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from './config/constants';

import { headers } from 'next/headers';

export default getRequestConfig(async () => {
  const localeHeader = headers().get('x-next-intl-locale');
  const validLocale = localeHeader && SUPPORTED_LOCALES.includes(localeHeader as Locale)
    ? localeHeader
    : DEFAULT_LOCALE;

  return {
    messages: (await import(`./lib/i18n/dictionaries/${validLocale}.json`)).default
  };
}) as any;
