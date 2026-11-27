import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core'
import { RouterLink } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { ChoiceOption, CommentEntry, MenuItem, PreviewImage } from '@20baht/ui'
import { Api } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n, type Translate } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { ago, cost, stamp } from '../../shared/format'
import { cardForm, REGISTRY, sameOriginImage, sendBackForm } from '../../shared/forms'
import { RUN_TONE, statusLabel, type CardStatus } from '../../shared/tones'
import { attempt } from '../../shared/attempt'
import { trimmed, type FormOf } from '../../shared/form-data'
import { changesOf, formValueOf, type CardFormValue } from './card-changes'

type CardData = NonNullable<ReturnType<CardDialogComponent['card']>['data']>
type RunStatus = NonNullable<CardData['last_run']>['status']

type Decision = 'send-back' | 'approve' | 'take'

/** Typed by key, so the choice answers a `Decision`, not a string. */
const decisions = (t: Translate): (ChoiceOption & { key: Decision })[] => [
  {
    key: 'send-back',
    label: t('card.decision.sendBack'),
    description: t('card.decision.sendBackHelp'),
  },
  {
    key: 'approve',
    label: t('card.decision.approve'),
    description: t('card.decision.approveHelp'),
  },
  { key: 'take', label: t('card.decision.take'), description: t('card.decision.takeHelp') },
]

const menu = (t: Translate): MenuItem[] => [
  { value: 'archive', label: t('card.archive'), danger: true },
]

/**
 * One card, always editable: its fields (saved with Save), its review decision when it waits on
 * one, the last run, the files and the comments. In the board's modal and the Review page.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, RouterLink],
  selector: 'app-card-dialog',
  styleUrl: './card-dialog.component.css',
  templateUrl: './card-dialog.component.html',
})
export class CardDialogComponent {
  private readonly live = inject(LiveService).live
  private readonly api = inject(Api).client.api
  protected readonly t = inject(I18n).t

  readonly cardId = input.required<number>()
  readonly closed = output()

  protected readonly card = liveSignal(() =>
    this.live.subscribe('GET', '/api/cards/:id', { params: { id: String(this.cardId()) } }),
  )
  protected readonly busy = signal(false)
  protected readonly dirty = signal(false)
  protected readonly error = signal<string | null>(null)
  /** The decision picked: back to Send back for each card, never carried over from the last one. */
  protected readonly decision = linkedSignal<number, Decision>({
    source: this.cardId,
    computation: () => 'send-back',
  })
  /** The Send back note: emptied when another card comes in, so a note is never sent to the wrong card. */
  private readonly backForm = viewChild<FormOf<typeof sendBackForm>>('back')
  /**
   * The form's clean data: the card as loaded, and as it changes after while nothing is being
   * edited. An edit in progress is never wiped by a live frame.
   */
  protected readonly start = signal<CardFormValue | null>(null)
  private loadedFor: number | null = null

  protected readonly cardForm = computed(() => cardForm(this.t))
  protected readonly sendBackForm = computed(() => sendBackForm(this.t))
  protected readonly registry = REGISTRY
  protected readonly allowImage = sameOriginImage
  protected readonly decisions = computed(() => decisions(this.t))
  protected readonly menu = computed(() => menu(this.t))
  protected readonly label = (status: CardStatus) => statusLabel(this.t, status)
  protected readonly runTone = RUN_TONE
  protected readonly runLabel = (status: RunStatus) => this.t(`status.run.${status}`)
  protected readonly ago = ago
  protected readonly cost = cost

  protected readonly comments = computed<CommentEntry[]>(() =>
    (this.card().data?.comments ?? []).map((c) => ({
      id: c.id,
      author:
        c.author === 'claude-worker'
          ? // no run: a schedule wrote it, and no agent was involved
            c.run_id === null
            ? this.t('card.authorSchedule')
            : this.t('card.authorRun', { run: c.run_id })
          : c.author === 'mcp'
            ? this.t('card.authorMcp')
            : this.t('card.authorYou'),
      time: stamp(c.created_at),
      body: c.body,
    })),
  )

  protected readonly images = computed<PreviewImage[]>(() =>
    (this.card().data?.attachments ?? []).map((a) => ({
      src: `/files/${a.id}`,
      alt: a.filename,
      caption: a.filename,
    })),
  )

  constructor() {
    effect(() => {
      const card = this.card().data
      if (!card) return
      if (this.loadedFor === card.id) {
        // someone else changed the card (an agent, another tab): a form with no edit follows it
        untracked(() => {
          if (!this.dirty() && !this.busy()) this.follow(card)
        })
        return
      }
      this.loadedFor = card.id
      this.start.set(formValueOf(card))
      // the same dialog shows another card (Review moves on): nothing of the last one stays
      untracked(() => {
        this.dirty.set(false)
        this.error.set(null)
        this.backForm()?.element.reset()
      })
    })
  }

  /** Gives the form the card as it is now, when that differs from what the form holds. */
  private follow(card: CardData): void {
    const next = formValueOf(card)
    if (JSON.stringify(next) !== JSON.stringify(this.start())) this.start.set(next)
  }

  private async act(work: () => Promise<unknown>): Promise<boolean> {
    this.error.set(null)
    return (
      (await attempt(
        this.busy,
        (message) => {
          this.error.set(message)
        },
        work,
      )) !== null
    )
  }

  protected async save(form: FormOf<typeof cardForm>): Promise<void> {
    const card = this.card().data
    const start = this.start()
    if (!card || !start || !form.validate().valid) return
    const d = form.getData()
    const id = String(card.id)
    const status = d.status
    // only what was changed here: the card may have been written to since the form was filled
    const patch = changesOf(start, d, card.tags)
    const ok = await this.act(async () => {
      if (Object.keys(patch).length > 0) await firstValueFrom(this.api.cards({ id }).patch(patch))
      if ((status === 'todo' || status === 'doing' || status === 'done') && status !== card.status)
        await firstValueFrom(this.api.cards({ id }).move.post({ status }))
    })
    if (ok) {
      form.element.markClean()
      this.dirty.set(false)
    }
  }

  protected cancel(form: FormOf<typeof cardForm>): void {
    form.element.reset()
    this.dirty.set(false)
    const card = this.card().data
    if (card) this.follow(card)
  }

  protected comment(body: string): Promise<boolean> {
    return this.act(() =>
      firstValueFrom(this.api.cards({ id: String(this.cardId()) }).comments.post({ body })),
    )
  }

  protected approve(): Promise<boolean> {
    return this.act(() =>
      firstValueFrom(this.api.cards({ id: String(this.cardId()) }).approve.post()),
    )
  }

  protected async sendBack(form: FormOf<typeof sendBackForm>): Promise<void> {
    if (!form.validate().valid) return
    const comment = trimmed(form.getData().comment)
    if (
      await this.act(() =>
        firstValueFrom(
          this.api.cards({ id: String(this.cardId()) })['send-back'].post({ comment }),
        ),
      )
    )
      form.element.reset()
  }

  protected take(): Promise<boolean> {
    return this.act(() => firstValueFrom(this.api.cards({ id: String(this.cardId()) }).take.post()))
  }

  protected async onMenu(value: string): Promise<void> {
    if (value !== 'archive') return
    if (
      await this.act(() =>
        firstValueFrom(this.api.cards({ id: String(this.cardId()) }).archive.post()),
      )
    )
      this.closed.emit()
  }
}
