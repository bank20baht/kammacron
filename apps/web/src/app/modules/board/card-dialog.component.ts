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
import type { BahtForm, CommentEntry, PreviewImage } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { LiveService } from '../../services/live.service'
import { ago, cost, stamp } from '../../shared/format'
import { cardForm, REGISTRY, sameOriginImage, sendBackForm } from '../../shared/forms'
import { RUN_TONE, STATUS_LABEL } from '../../shared/tones'

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** One card: edit it, talk on it, see its last run, decide a review. */
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

  readonly cardId = input.required<number>()
  readonly closed = output()

  protected readonly card = liveSignal(() =>
    this.live.subscribe('GET', '/api/cards/:id', { params: { id: String(this.cardId()) } }),
  )
  protected readonly editing = signal(false)
  protected readonly busy = signal(false)
  protected readonly error = signal<string | null>(null)
  protected readonly editValue = signal<Record<string, unknown>>({})
  protected readonly diff = signal<{ stat: string } | null>(null)

  protected readonly cardForm = cardForm
  protected readonly sendBackForm = sendBackForm
  protected readonly registry = REGISTRY
  protected readonly allowImage = sameOriginImage
  protected readonly label = STATUS_LABEL
  protected readonly runTone = RUN_TONE
  protected readonly ago = ago
  protected readonly cost = cost

  protected readonly comments = computed<CommentEntry[]>(() =>
    (this.card().data?.comments ?? []).map((c) => ({
      id: c.id,
      author:
        c.author === 'claude-worker'
          ? `Claude (run ${String(c.run_id ?? '')})`
          : c.author === 'mcp'
            ? 'Claude (MCP)'
            : 'You',
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
    // the diff stat of a review card's branch, once per card
    effect(() => {
      const card = this.card().data
      if (card?.status === 'review' && card.branch && this.diff() === null)
        void this.loadDiff(card.id)
    })
  }

  private async loadDiff(id: number): Promise<void> {
    this.diff.set({ stat: '…' })
    try {
      const diff = await firstValueFrom(this.api.cards({ id: String(id) }).diff.get())
      this.diff.set({ stat: diff.stat || '(no changes against the default branch)' })
    } catch (error) {
      this.diff.set({ stat: describeError(error) })
    }
  }

  protected edit(): void {
    const card = this.card().data
    if (!card) return
    this.editValue.set({
      title: card.title,
      body: card.body,
      tags: card.tags,
      human: card.human,
      priority: card.priority,
      waits_on: card.waits_on.map((w) => String(w.id)).join(', '),
    })
    this.editing.set(true)
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
    if (!form.validate().valid) return
    const d = form.getData()
    const waits = text(d['waits_on'])
      .split(/[\s,#]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
    const ok = await this.act(() =>
      firstValueFrom(
        this.api.cards({ id: String(this.cardId()) }).patch({
          title: text(d['title']),
          body: text(d['body']),
          tags: Array.isArray(d['tags']) ? (d['tags'] as string[]) : [],
          human: d['human'] === true,
          priority: Math.round(Number(d['priority']) || 0),
          waits_on: waits,
        }),
      ),
    )
    if (ok) this.editing.set(false)
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

  protected async archive(): Promise<void> {
    if (
      await this.act(() =>
        firstValueFrom(this.api.cards({ id: String(this.cardId()) }).archive.post()),
      )
    )
      this.closed.emit()
  }
}
