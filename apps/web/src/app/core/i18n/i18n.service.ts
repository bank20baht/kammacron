import { computed, effect, Injectable, signal } from '@angular/core'
import { setLocale as setEngineLocale } from '@20baht/ui/engine'

import { en } from './en'
import { translate, type KeysOf, type Params, type ShapeOf } from './translate'

/** Every language the app speaks. A new one is a catalog of `en`'s shape (`ShapeOf<typeof en>`). */
const CATALOGS = { en } satisfies Record<string, ShapeOf<typeof en>>

export type AppLocale = keyof typeof CATALOGS
export type MessageKey = KeysOf<typeof en>
/** `t('board.title')`, `t('review.count', { count: 3 })`. */
export type Translate = (key: MessageKey, params?: Params) => string

const LOCALES = Object.keys(CATALOGS) as AppLocale[]

/** The catalog of the library's own messages (validation) each locale uses. */
const ENGINE_LOCALE: Record<AppLocale, 'en' | 'th'> = { en: 'en' }
const STORE = 'kammacron.locale'
/** Where the choice is kept; absent outside a browser (tests, server rendering). */
const storage = (): Storage | undefined => (globalThis as { localStorage?: Storage }).localStorage
const isLocale = (value: string | null): value is AppLocale =>
  value !== null && LOCALES.some((l) => l === value)

/** The locale chosen before, else the browser's language when the app speaks it, else English. */
const first = (): AppLocale => {
  const kept = storage()?.getItem(STORE) ?? null
  if (isLocale(kept)) return kept
  const browser =
    (globalThis as { navigator?: Navigator }).navigator?.language.split('-')[0] ?? null
  return isLocale(browser) ? browser : 'en'
}

const locale = signal<AppLocale>(first())

/** The current locale, for code outside DI (the display formats). */
export const currentLocale = locale.asReadonly()

/** The locale dates are written in by Intl: `en-GB` keeps "25 Nov 2026", the elements' default. */
const DATE_LOCALE: Record<AppLocale, string> = { en: 'en-GB' }
export const dateLocale = computed(() => DATE_LOCALE[locale()])

/** `t` without DI, reading the current locale: for the form and column builders. */
export const t: Translate = (key, params) => translate(CATALOGS[locale()], locale(), key, params)

/**
 * The app's words. Templates call `t(...)` (a signal read, so a locale change redraws them); the
 * page's `lang`, the engine's validation messages and the display formats follow the locale.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly locale = currentLocale
  readonly locales = LOCALES
  readonly t = t

  constructor() {
    effect(() => {
      const now = locale()
      document.documentElement.lang = now
      setEngineLocale(ENGINE_LOCALE[now])
    })
  }

  setLocale(next: AppLocale): void {
    locale.set(next)
    storage()?.setItem(STORE, next)
  }
}
