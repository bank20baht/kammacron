import { t } from '../core/i18n/i18n.service'
// defines <kc-cron>, the five boxes of the Cron card
import './cron-input'
import type { CronInput } from './cron-input'
import {
  cronOfPick,
  cronProblem,
  cronSummary,
  dayKey,
  INTERVALS,
  pickOf,
  pickProblem,
  pickSummary,
  WEEK,
  type SchedulePick,
} from './schedule'

// declaration merging names the type for TypeScript: it needs interfaces, not type aliases
/* eslint-disable @typescript-eslint/consistent-type-definitions */
declare module '@20baht/engine' {
  interface CustomFieldTypes {
    schedule: true
  }
  interface CustomFieldValues {
    schedule: string
  }
}
/* eslint-enable @typescript-eslint/consistent-type-definitions */

/** The modes, as radio cards, in the order they are read. */
const CARDS = ['interval', 'hourly', 'date', 'cron'] as const

let ids = 0

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`)

/**
 * `<kc-schedule>`: when a cron job runs, set the way an alarm clock is set. Four mode cards (every
 * few minutes, every hour, on some days at a time, cron), the days as chips, a sentence that reads
 * it back, and
 * Cron: the five fields in `<kc-cron>`'s five boxes (the app's stand-in for `baht-cron`). The control of the `schedule` field
 * type (`registry.fieldTypes.schedule`). Its value is a cron expression, a string; null while the
 * pick is not complete.
 */
export class ScheduleInput extends HTMLElement {
  private pick: SchedulePick = pickOf(undefined)
  private sent: string | null = cronOfPick(this.pick)
  private readonly uid = `kc-schedule-${String(++ids)}`
  private flags = { disabled: false, readonly: false }
  private errorText = ''
  private fieldValue: unknown = null
  private requiredValue = false
  showOptional = false
  debounce = 0

  get field(): unknown {
    return this.fieldValue
  }

  set field(v: unknown) {
    // the form hands the descriptor again after every edit: draw again only for a new label
    const label = (f: unknown) => (f as { label?: string } | null)?.label
    const changed = label(v) !== label(this.fieldValue)
    this.fieldValue = v
    if (changed && this.firstChild) this.render()
  }

  get required(): boolean {
    return this.requiredValue
  }

  set required(v: boolean) {
    if (v === this.requiredValue) return
    this.requiredValue = v
    if (this.firstChild) this.render()
  }

  get value(): string | null {
    return this.sent
  }

  set value(v: unknown) {
    const cron = typeof v === 'string' && v.trim() ? v : null
    // the form hands back what this sent after every edit: keep the pick (and the focus) then
    if (cron === this.sent && this.firstChild) return
    this.pick = pickOf(cron ?? undefined)
    this.sent = cronOfPick(this.pick)
    this.render()
  }

  set disabled(v: boolean) {
    if (v === this.flags.disabled) return
    this.flags.disabled = v
    if (this.firstChild) this.render()
  }

  set readonly(v: boolean) {
    if (v === this.flags.readonly) return
    this.flags.readonly = v
    if (this.firstChild) this.render()
  }

  set error(v: string | null | undefined) {
    this.errorText = v ?? ''
    const el = this.querySelector('.kc-schedule-error')
    if (el) el.textContent = this.errorText
  }

  connectedCallback(): void {
    this.render()
  }

  private get off(): string {
    return this.flags.disabled || this.flags.readonly ? ' disabled' : ''
  }

  private update(patch: Partial<SchedulePick>, redraw: boolean): void {
    this.pick = { ...this.pick, ...patch }
    this.sent = cronOfPick(this.pick)
    if (redraw) this.render()
    else this.refresh()
    this.dispatchEvent(
      new CustomEvent('baht-input', {
        bubbles: true,
        composed: true,
        detail: { value: this.sent },
      }),
    )
  }

  /** The sentence, or what is missing. */
  private refresh(): void {
    const foot = this.querySelector('.kc-schedule-summary')
    if (foot) foot.textContent = this.sentence()
  }

  private sentence(): string {
    const problem = pickProblem(this.pick)
    if (problem) return t(`forms.schedule.picker.problem.${problem}`)
    // typed in: read it through the picker, so "*/5 * * * *" still says "every 5 minutes"
    const words = this.pick.mode === 'cron' ? cronSummary(t, this.sent) : pickSummary(t, this.pick)
    return `${words} · cron ${this.sent ?? ''}`
  }

  /** The field's label: a control of the app's own draws its own (LIB_GAP.md). */
  private label(): string {
    const f = (this.fieldValue ?? {}) as { label?: string }
    if (!f.label) return ''
    const mark = this.requiredValue
      ? '<span class="baht-required-mark" aria-hidden="true">*</span>'
      : ''
    return `<span class="baht-label" id="${this.uid}-label">${escape(f.label)}${mark}</span>`
  }

  private chip(attr: string, value: number, text: string, on: boolean): string {
    return `<button type="button" class="kc-schedule-chip${on ? ' is-on' : ''}" ${attr}="${String(value)}"
      aria-pressed="${String(on)}"${this.off}>${escape(text)}</button>`
  }

  private dateBody(): string {
    const s = this.pick
    const chips = WEEK.map((d) =>
      this.chip('data-day', d, t(`forms.schedule.dayShort.${dayKey(d)}`), s.days.includes(d)),
    ).join('')
    return `<div class="kc-schedule-row">
        <input type="time" class="baht-control kc-schedule-time" data-time value="${escape(s.time)}"
          aria-label="${escape(t('forms.schedule.picker.time'))}"${this.off} />
        <div class="kc-schedule-chips" role="group" aria-label="${escape(t('forms.schedule.picker.days'))}">${chips}</div>
      </div>`
  }

  private cronBody(): string {
    return `<kc-cron></kc-cron>
      <p class="kc-schedule-help">${escape(t('forms.schedule.picker.cronHelp'))}</p>`
  }

  private body(): string {
    switch (this.pick.mode) {
      case 'date':
        return this.dateBody()
      case 'interval': {
        const chips = INTERVALS.map((n) =>
          this.chip('data-every', n, String(n), this.pick.every === n),
        ).join('')
        return `<div class="kc-schedule-row">
            <span>${escape(t('forms.schedule.picker.every'))}</span>
            <div class="kc-schedule-chips" role="group" aria-label="${escape(t('forms.schedule.picker.minutes'))}">${chips}</div>
            <span>${escape(t('forms.schedule.picker.minutes'))}</span>
          </div>`
      }
      case 'hourly':
        return `<div class="kc-schedule-row">
            <span>${escape(t('forms.schedule.picker.atMinute'))}</span>
            <input type="number" class="baht-control kc-schedule-num" data-minute min="0" max="59" step="1"
              value="${String(this.pick.minute)}" aria-label="${escape(t('forms.schedule.picker.atMinute'))}"${this.off} />
            <span>${escape(t('forms.schedule.picker.pastTheHour'))}</span>
          </div>`
      case 'cron':
        return this.cronBody()
    }
  }

  private render(): void {
    const s = this.pick
    const cards = CARDS.map((mode) => {
      const on = s.mode === mode
      return `<label class="kc-schedule-mode${on ? ' is-on' : ''}">
          <input type="radio" name="${this.uid}" value="${mode}"${on ? ' checked' : ''}${this.off} />
          <span>${escape(t(`forms.schedule.picker.mode.${mode}`))}</span>
        </label>`
    }).join('')
    this.innerHTML = `<div class="kc-schedule">
        ${this.label()}
        <div class="kc-schedule-modes" role="radiogroup" aria-labelledby="${this.uid}-label">${cards}</div>
        ${this.body()}
        <p class="kc-schedule-summary">${escape(this.sentence())}</p>
        <p class="kc-schedule-error" role="alert">${escape(this.errorText)}</p>
      </div>`
    this.wire()
  }

  private wire(): void {
    for (const radio of this.querySelectorAll<HTMLInputElement>('.kc-schedule-mode input'))
      radio.addEventListener('change', () => {
        this.pickMode(radio.value as SchedulePick['mode'])
      })
    for (const chip of this.querySelectorAll<HTMLButtonElement>('[data-day]'))
      chip.addEventListener('click', () => {
        const day = Number(chip.dataset['day'])
        const days = this.pick.days.includes(day)
          ? this.pick.days.filter((d) => d !== day)
          : [...this.pick.days, day]
        this.update({ days }, true)
      })
    for (const chip of this.querySelectorAll<HTMLButtonElement>('[data-every]'))
      chip.addEventListener('click', () => {
        this.update({ every: Number(chip.dataset['every']) }, true)
      })
    this.querySelector<HTMLInputElement>('[data-time]')?.addEventListener('input', (e) => {
      this.update({ time: (e.target as HTMLInputElement).value }, false)
    })
    this.querySelector<HTMLInputElement>('[data-minute]')?.addEventListener('input', (e) => {
      this.update({ minute: Number((e.target as HTMLInputElement).value) }, false)
    })
    this.wireCron()
  }

  /** Into the boxes with the five fields the picker makes now; back out to the picker that reads them. */
  /**
   * A mode card picked. Into Cron, the boxes start from what the mode before made; out of it, the
   * other modes keep what they held.
   */
  private pickMode(mode: SchedulePick['mode']): void {
    if (mode === 'cron' && this.pick.mode !== 'cron') {
      const cron = cronOfPick(this.pick) ?? '* * * * *'
      this.update({ mode, parts: cron.split(' ') }, true)
      this.querySelector<CronInput>('kc-cron')?.focus()
      return
    }
    this.update({ mode }, true)
  }

  /** The five boxes: given the parts, and each edit taken back (it stops here, the form hears `baht-input`). */
  private wireCron(): void {
    const cron = this.querySelector<CronInput>('kc-cron')
    if (!cron) return
    cron.disabled = this.off !== ''
    cron.value = this.pick.parts.join(' ')
    cron.addEventListener('baht-change', (e) => {
      e.stopPropagation()
      const { value } = (e as CustomEvent<{ value: string }>).detail
      this.update({ parts: value.split(' ') }, false)
    })
  }
}

/** The `schedule` field type: the picker, its check (a message, or null) and its read-only text. */
export const SCHEDULE_FIELD = {
  tag: 'kc-schedule',
  check: (value: unknown) => (cronProblem(value) ? t('forms.schedule.picker.problem.cron') : null),
  display: (value: unknown) => `${cronSummary(t, value)} (${String(value)})`,
}

if (typeof customElements !== 'undefined' && !customElements.get('kc-schedule'))
  customElements.define('kc-schedule', ScheduleInput)
