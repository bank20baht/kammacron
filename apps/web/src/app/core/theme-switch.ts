import { DestroyRef, DOCUMENT, inject } from '@angular/core'

/** On `<html>` for the frame a theme changes in: `styles.css` holds every transition still. */
const SWITCHING = 'app-theme-switching'

/**
 * A new theme lands in one frame. Every colour has a transition (a button's hover, a column's drag
 * highlight), so without this a switch fades each part at its own pace and the page shows both
 * themes at once: dark columns under dark headings, a black button with black text. Whatever sets
 * `data-baht-theme` (the toggle, another tab's choice, the system's), the transitions are held for
 * the frame it is drawn in. Call it in an injection context.
 */
export const instantThemeSwitch = (): void => {
  const doc = inject(DOCUMENT)
  const root = doc.documentElement
  const view = doc.defaultView
  if (!view || typeof MutationObserver === 'undefined') return
  const observer = new MutationObserver(() => {
    root.classList.add(SWITCHING)
    // two frames: the first draws the new colours with no transition, the second lets them go
    view.requestAnimationFrame(() =>
      view.requestAnimationFrame(() => {
        root.classList.remove(SWITCHING)
      }),
    )
  })
  observer.observe(root, { attributes: true, attributeFilter: ['data-baht-theme'] })
  inject(DestroyRef).onDestroy(() => {
    observer.disconnect()
  })
}
