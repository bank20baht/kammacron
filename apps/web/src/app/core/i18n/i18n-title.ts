import { effect, inject, Injectable, signal } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { TitleStrategy, type RouterStateSnapshot } from '@angular/router'

import { I18n, type MessageKey } from './i18n.service'

/** A route's `title` is a message key: the tab reads `<page> · kammacron`, and follows the locale. */
@Injectable({ providedIn: 'root' })
export class I18nTitle extends TitleStrategy {
  private readonly title = inject(Title)
  private readonly t = inject(I18n).t
  private readonly key = signal<string | undefined>(undefined)

  constructor() {
    super()
    effect(() => {
      const key = this.key()
      if (key === undefined) return
      this.title.setTitle(this.t('titles.suffix', { page: this.t(key as MessageKey) }))
    })
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key.set(this.buildTitle(snapshot))
  }
}
