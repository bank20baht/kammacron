import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core'
import { RouterLink } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { BahtForm, ChoiceOption, CommentEntry, MenuItem, PreviewImage } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n, type Translate } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { ago, cost, stamp } from '../../shared/format'
import { cardForm, REGISTRY, sameOriginImage, sendBackForm } from '../../shared/forms'
import { RUN_TONE, statusLabel, type CardStatus } from '../../shared/tones'

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const CLAUDE = 'claude'

type CardData = NonNullable<ReturnType<CardDialogComponent['card']>['data']>
type RunStatus = NonNullable<CardData['last_run']>['status']

type Decision = 'send-back' | 'approve' | 'take'

const decisions = (t: Translate): ChoiceOption[] => [
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
 * one, the last run, the files and the comments. In the board's drawer and the Review page.
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
  protected readonly decision = signal<Decision>('send-back')
  /** The form's starting data: taken once per card, so live frames never wipe an edit. */
  protected readonly start = signal<Record<string, unknown> | null>(null)
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
          ? this.t('card.authorRun', { run: c.run_id ?? '' })
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
      if (!card || this.loadedFor === card.id) return
      this.loadedFor = card.id
      this.start.set(this.valueOf(card))
    })
  }

  private valueOf(card: NonNullable<ReturnType<typeof this.card>['data']>) {
    return {
      title: card.title,
      body: card.body,
      status: card.status,
      owner: card.human ? 'human' : card.tags.includes(CLAUDE) ? 'claude' : 'none',
      priority: card.priority,
      tags: card.tags.filter((t) => t !== CLAUDE),
      waits_on: card.waits_on.map((w) => String(w.id)).join(', '),
    }
  }

  private async act(work: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true)
    this.error.set(null)
    try {
      await work()
      return true
    } catch (error) {
      this.error.set(describeError(error))
      return false
    } finally {
      this.busy.set(false)
    }
  }

  protected async save(form: BahtForm): Promise<void> {
    const card = this.card().data
    if (!card || !form.validate().valid) return
    const d = form.getData()
    const owner = text(d['owner'])
    const others = Array.isArray(d['tags'])
      ? (d['tags'] as string[]).filter((t) => t !== CLAUDE)
      : []
    const waits = text(d['waits_on'])
      .split(/[\s,#]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
    const id = String(card.id)
    const status = text(d['status'])
    const ok = await this.act(async () => {
      await firstValueFrom(
        this.api.cards({ id }).patch({
          title: text(d['title']),
          body: text(d['body']),
          tags: owner === 'claude' ? [CLAUDE, ...others] : others,
          human: owner === 'human',
          priority: Math.round(Number(d['priority']) || 0),
          waits_on: waits,
        }),
      )
      if ((status === 'todo' || status === 'doing' || status === 'done') && status !== card.status)
        await firstValueFrom(this.api.cards({ id }).move.post({ status }))
    })
    if (ok) {
      form.markClean()
      this.dirty.set(false)
    }
  }

  protected cancel(form: BahtForm): void {
    form.reset()
    this.dirty.set(false)
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

  protected async sendBack(form: BahtForm): Promise<void> {
    if (!form.validate().valid) return
    const comment = text(form.getData()['comment']).trim()
    if (
      await this.act(() =>
        firstValueFrom(
          this.api.cards({ id: String(this.cardId()) })['send-back'].post({ comment }),
        ),
      )
    )
      form.reset()
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
