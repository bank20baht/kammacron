import { t } from '../core/i18n/i18n.service'
import { CRON_PARTS, fieldsOf, partValid } from './schedule'

/** What a box takes: digits and `*` `,` `/` `-`. */
const PART_CHARS = /[^0-9*,/-]/g

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`)

/** Five boxes from `from` on, at most: the words, each kept to what a box takes. */
const spread = (parts: readonly string[], from: number, words: readonly string[]) => {
  const next = [...parts]
  while (next.length < 5) next.push('')
  words.slice(0, 5 - from).forEach((word, k) => {
    next[from + k] = word.replace(PART_CHARS, '')
  })
  return next
}

/** The five fields of an expression; what is not five fields lands in the boxes word by word. */
const partsOf = (text: string): string[] =>
  spread([], 0, fieldsOf(text) ?? text.trim().split(/\s+/).filter(Boolean))

/**
 * `<kc-cron>`: a cron expression in five boxes (minute, hour, day of month, month, day of week),
 * typed as a one-time code is: a space moves to the next box, Backspace in an empty box steps
 * back, the arrows cross boxes, and an expression pasted into any box (or `@daily`) fills all
 * five. A box whose text its field does not take is marked invalid.
 *
 * The app's stand-in for the `baht-cron` element LIB_GAP.md asks `@20baht/ui` for: `value` is the
 * expression (a string), `disabled` locks it, and every edit tells `baht-change` with
 * `{ value, valid }` (`value` is the five boxes joined, even while one is empty or wrong).
 */
export class CronInput extends HTMLElement {
  private parts: string[] = ['', '', '', '', '']
  private locked = false

  get value(): string {
    return this.parts.join(' ')
  }

  set value(v: unknown) {
    const text = typeof v === 'string' ? v : ''
    if (text === this.value && this.firstChild) return
    this.parts = partsOf(text)
    this.render()
  }

  get valid(): boolean {
    return this.parts.every((part, i) => partValid(part, i))
  }

  set disabled(v: boolean) {
    if (v === this.locked) return
    this.locked = v
    if (this.firstChild) this.render()
  }

  connectedCallback(): void {
    if (!this.firstChild) this.render()
  }

  /** The first box, for a host that opens the boxes and wants the caret in them. */
  override focus(): void {
    this.querySelector<HTMLInputElement>('[data-part="0"]')?.focus()
  }

  private render(): void {
    const boxes = CRON_PARTS.map((part, i) => {
      const value = this.parts[i] ?? ''
      const bad = value !== '' && !partValid(value, i)
      const name = t(`forms.schedule.picker.part.${part.key}`)
      return `<label class="kc-cron-part">
          <input type="text" class="baht-control kc-cron-box" data-part="${String(i)}" value="${escape(value)}"
            autocomplete="off" spellcheck="false" maxlength="20" aria-invalid="${String(bad)}"
            aria-label="${escape(name)}"${this.locked ? ' disabled' : ''} />
          <span>${escape(name)}</span>
        </label>`
    }).join('')
    this.innerHTML = `<div class="kc-cron-boxes" role="group" aria-label="${escape(t('forms.schedule.picker.cron'))}">${boxes}</div>`
    this.wire()
  }

  /** New parts: into the boxes that differ, each box's mark, the caret, and `baht-change`. */
  private show(boxes: HTMLInputElement[], parts: readonly string[], focus: number): void {
    this.parts = [...parts]
    boxes.forEach((box, k) => {
      const text = parts[k] ?? ''
      if (box.value !== text) box.value = text
      box.setAttribute('aria-invalid', String(text !== '' && !partValid(text, k)))
    })
    boxes[Math.max(0, Math.min(4, focus))]?.focus()
    this.dispatchEvent(
      new CustomEvent('baht-change', {
        bubbles: true,
        composed: true,
        detail: { value: this.value, valid: this.valid },
      }),
    )
  }

  private wire(): void {
    const boxes = [...this.querySelectorAll<HTMLInputElement>('[data-part]')]
    boxes.forEach((box, i) => {
      box.addEventListener('input', () => {
        const text = box.value
        if (/\s/.test(text)) {
          // a space moves on to the next box; words typed or dropped in spread from here
          const words = text.split(/\s+/).filter(Boolean)
          this.show(
            boxes,
            spread(this.parts, i, words.length ? words : ['']),
            i + Math.max(1, words.length),
          )
          return
        }
        this.show(boxes, spread(this.parts, i, [text]), i)
      })
      box.addEventListener('keydown', (e) => {
        const atStart = box.selectionStart === 0 && box.selectionEnd === 0
        const atEnd = box.selectionStart === box.value.length
        if (e.key === 'Backspace' && box.value === '' && i > 0) {
          e.preventDefault()
          boxes[i - 1]?.focus()
        } else if (e.key === 'ArrowLeft' && atStart && i > 0) {
          e.preventDefault()
          boxes[i - 1]?.focus()
        } else if (e.key === 'ArrowRight' && atEnd && i < 4) {
          e.preventDefault()
          boxes[i + 1]?.focus()
        }
      })
      box.addEventListener('paste', (e) => {
        const text = (e.clipboardData?.getData('text') ?? '').trim()
        const words = text.split(/\s+/)
        const whole = words.length >= 5 || text.startsWith('@')
        if (!whole && words.length < 2) return
        e.preventDefault()
        // a whole expression (or a macro, spelt out) fills every box; a few words fill from here
        if (whole) this.show(boxes, partsOf(text), 4)
        else this.show(boxes, spread(this.parts, i, words), i + words.length - 1)
      })
    })
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('kc-cron'))
  customElements.define('kc-cron', CronInput)
