import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import { guess } from '@20baht/live/browser'
import type { FormDefinition, NavItem } from '@20baht/ui'
import { Api, answer, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { newCardForm, REGISTRY } from '../../shared/forms'
import { STATUS_LABEL, type CardStatus } from '../../shared/tones'
import { CardDialogComponent } from './card-dialog.component'

const COLUMNS: CardStatus[] = ['todo', 'doing', 'review', 'done']

/** Four columns, live; drag a card to move it, open it to edit, talk, review. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, CardDialogComponent],
  selector: 'web-board',
  styleUrl: './board.component.css',
  templateUrl: './board.component.html',
})
export class BoardComponent {
  private readonly live = inject(LiveService).live
  private readonly api = inject(Api).client.api
  private readonly router = inject(Router)

  /** `/board/:slug`; all projects without one. */
  readonly slug = input<string>()
  /** `?card=12` opens a card. */
  readonly card = input<string>()

  protected readonly projects = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects', { query: {} }),
  )
  protected readonly project = computed(
    () => (this.projects().data ?? []).find((p) => p.slug === this.slug()) ?? null,
  )
  protected readonly cards = liveSignal(() => {
    const project = this.project()
    if (this.slug() && !project) return null
    return this.live.subscribe('GET', '/api/cards', {
      query: project ? { project_id: String(project.id) } : {},
    })
  })

  protected readonly columns = COLUMNS
  protected readonly label = STATUS_LABEL
  protected readonly ago = ago
  protected readonly openCard = computed(() => {
    const id = Number(this.card())
    return Number.isInteger(id) && id > 0 ? id : null
  })

  protected readonly nav = computed<NavItem[]>(() => [
    { key: '', label: 'All', href: '/board' },
    ...(this.projects().data ?? []).map((p) => ({
      key: p.slug,
      label: p.name,
      href: `/board/${p.slug}`,
    })),
  ])

  protected readonly byColumn = computed(() => {
    const all = this.cards().data ?? []
    const groups = Object.fromEntries(COLUMNS.map((s) => [s, [] as typeof all])) as Record<
      CardStatus,
      typeof all
    >
    for (const card of all) groups[card.status].push(card)
    for (const status of COLUMNS)
      groups[status].sort((a, b) => a.position - b.position || a.id - b.id)
    return groups
  })

  protected readonly projectName = computed(() => {
    const names = new Map((this.projects().data ?? []).map((p) => [p.id, p.name]))
    return (id: number) => names.get(id) ?? ''
  })

  // a new card
  protected readonly creating = signal(false)
  protected readonly error = signal<string | null>(null)
  protected readonly createError = signal('')
  protected readonly registry = REGISTRY
  protected readonly newValue = signal<Record<string, unknown>>({})
  protected readonly newForm = computed<FormDefinition>(() => ({
    ...newCardForm,
    fields: newCardForm.fields.map((f) =>
      f.key === 'project_id'
        ? {
            ...f,
            options: (this.projects().data ?? []).map((p) => ({
              key: String(p.id),
              label: p.name,
            })),
          }
        : f,
    ),
  }))

  private dragged: number | null = null

  protected navigate(event: Event): void {
    const { href } = (event as CustomEvent<{ href?: string }>).detail
    if (!href) return
    event.preventDefault()
    void this.router.navigateByUrl(href)
  }

  protected go(url: string): void {
    void this.router.navigateByUrl(url)
  }

  protected open(id: number | null): void {
    void this.router.navigate([], { queryParams: { card: id }, queryParamsHandling: 'merge' })
  }

  protected startNew(): void {
    const project = this.project() ?? this.projects().data?.[0]
    this.newValue.set({
      project_id: project ? String(project.id) : null,
      tags: ['claude'],
      human: false,
    })
    this.createError.set('')
    this.creating.set(true)
  }

  protected async create(data: Record<string, unknown>): Promise<void> {
    try {
      const [card] = answer(
        await firstValueFrom(
          this.api.cards.batch.post({
            cards: [
              {
                project_id: Number(data['project_id']),
                title: typeof data['title'] === 'string' ? data['title'].trim() : '',
                body: typeof data['body'] === 'string' ? data['body'] : '',
                tags: Array.isArray(data['tags']) ? (data['tags'] as string[]) : [],
                human: data['human'] === true,
              },
            ],
          }),
        ),
      )
      this.creating.set(false)
      if (card) this.open(card.id)
    } catch (error) {
      this.createError.set(describeError(error))
    }
  }

  protected dragStart(id: number): void {
    this.dragged = id
  }

  /** Dropped on a column, or before one of its cards: the move shows at once, the server confirms. */
  protected async drop(event: DragEvent, status: CardStatus, before: number | null): Promise<void> {
    event.preventDefault()
    event.stopPropagation()
    const id = this.dragged
    this.dragged = null
    if (id === null) return
    const column = this.byColumn()[status].filter((c) => c.id !== id)
    const at = before === null ? column.length : column.findIndex((c) => c.id === before)
    const prev = column[at - 1]?.position
    const next = column[at]?.position
    const position =
      prev === undefined
        ? next === undefined
          ? 1
          : next - 1
        : next === undefined
          ? prev + 1
          : (prev + next) / 2
    const board = this.cards.subscription()
    const body =
      status === 'review'
        ? { status, position, reason: 'moved to review by hand' }
        : { status, position }
    try {
      await this.live.mutate(
        { method: 'POST', path: `/api/cards/${String(id)}/move`, body },
        {
          optimistic: board
            ? [
                guess(board, (all) =>
                  all.map((c) => (c.id === id ? { ...c, status, position } : c)),
                ),
              ]
            : [],
        },
      )
    } catch (error) {
      this.error.set(describeError(error))
    }
  }
}
