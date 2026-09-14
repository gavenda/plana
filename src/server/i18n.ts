import i18next from 'i18next'

import en from './locales/en.json'

/** Discord sends locales like `en-US`, `ja` or `fr`; unknown ones fall back to `en`. */
export const DEFAULT_LOCALE = 'en-US'

export async function initI18n(): Promise<void> {
  await i18next.init({
    lng: DEFAULT_LOCALE,
    fallbackLng: 'en',
    resources: { en },
    // Output goes to Discord, not HTML. Escaping would mangle markdown and mentions.
    interpolation: { escapeValue: false },
  })
}

export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options ?? {})
}

/** Adds the caller's locale to an interpolation bag. */
export function tl(key: string, locale: string, options?: Record<string, unknown>): string {
  return t(key, { lng: locale, ...options })
}
