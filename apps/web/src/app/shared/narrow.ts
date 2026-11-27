import { DestroyRef, inject, signal, type Signal } from '@angular/core'

/** A phone's width: the same line `styles.css` draws for the page header. */
const NARROW = '(width < 600px)'

/**
 * Whether the window is phone-narrow (or narrower than `media` says), kept up as it is resized. Call it in an injection context.
 * Read it once (`untracked`) for a default that must not change under the person's hands.
 */
export const narrowScreen = (media = NARROW): Signal<boolean> => {
  const query = typeof matchMedia === 'function' ? matchMedia(media) : null
  const narrow = signal(query?.matches ?? false)
  if (query) {
    const changed = (e: MediaQueryListEvent) => {
      narrow.set(e.matches)
    }
    query.addEventListener('change', changed)
    inject(DestroyRef).onDestroy(() => {
      query.removeEventListener('change', changed)
    })
  }
  return narrow.asReadonly()
}
