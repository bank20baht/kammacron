import type { CanDeactivateFn } from '@angular/router'

/** A page that may hold an unsaved draft: it answers whether leaving it now is all right. */
export type HasDraft = {
  /** True to leave; a page with a draft asks the person first (stay, or discard and go). */
  canLeave(): boolean | Promise<boolean>
}

/**
 * Leaving a page with a draft goes through the page first: a link inside it, the sidebar and the
 * browser's Back alike. Reload and closing the tab are `<baht-save-bar warn-on-leave>`'s.
 */
export const draftGuard: CanDeactivateFn<HasDraft> = (page) => page.canLeave()
