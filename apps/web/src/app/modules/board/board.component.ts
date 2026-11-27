import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import { guess } from '@20baht/live/browser'
import type { BahtForm, FormDefinition, NavItem } from '@20baht/ui'
import type { FormValues } from '@20baht/ui/engine'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { IllustrationComponent } from '../../shared/illustration/illustration.component'
import { I18n } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { newCardForm, quickAddForm, REGISTRY } from '../../shared/forms'
import { statusLabel, type CardStatus } from '../../shared/tones'
import { dataOf, trimmed } from '../../shared/form-data'
import {
  KanbanComponent,
  KanbanFooterDirective,
  KanbanTileDirective,
  type KanbanColumn,
  type KanbanMove,
} from '../../shared/kanban/kanban.component'
import { CronWizardComponent } from '../cron/cron-wizard.component'
import { AUTOPILOT } from './card-changes'
import { CardDialogComponent } from './card-dialog.component'

const COLUMNS: CardStatus[] = ['todo', 'doing', 'review', 'done']
/** Tags a tile shows before the rest become "+N" (the card itself shows them all). */
const TILE_TAGS = 4
const ACCENT: Record<CardStatus, string> = {
  todo: 'var(--baht-color-border-strong)',
  doing: 'var(--baht-color-primary)',
  review: 'var(--baht-color-warning)',
  done: 'var(--baht-color-success)',
}
const isStatus = (value: string): value is CardStatus => COLUMNS.some((c) => c === value)

/** Four columns, live; drag a card (or Alt+arrows) to move it, open it in a modal, add one in To do. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IllustrationComponent,
    BAHT_UI,
    CardDialogComponent,
    CronWizardComponent,
    RouterLink,
    KanbanComponent,
    KanbanTileDirective,
    KanbanFooterDirective,
  ],
  selector: 'web-board',
  styleUrl: './board.component.css',
  templateUrl: './board.component.html',
})
export class BoardComponent {
  private readonly live = inject(LiveService).live
  private readonly api = inject(Api).client.api
  private readonly router = inject(Router)
  protected readonly t = inject(I18n).t

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
      // tiles only: a card opened is fetched whole (card-dialog), so the bodies stay home
      query: project ? { project_id: String(project.id), lean: 'true' } : { lean: 'true' },
    })
  })

  protected readonly kanbanColumns = computed<KanbanColumn[]>(() =>
    COLUMNS.map((key) => ({ key, label: statusLabel(this.t, key), accent: ACCENT[key] })),
  )
  protected readonly ago = ago
  protected readonly autopilot = AUTOPILOT
  protected readonly otherTags = computed(
    () => (tags: readonly string[]) => tags.filter((tag) => tag !== AUTOPILOT),
  )
  protected readonly shownTags = computed(
    () => (tags: readonly string[]) => this.otherTags()(tags).slice(0, TILE_TAGS),
  )
  protected readonly hiddenTags = computed(
    () => (tags: readonly string[]) => Math.max(0, this.otherTags()(tags).length - TILE_TAGS),
  )
  protected readonly openCard = computed(() => {
    const id = Number(this.card())
    return Number.isInteger(id) && id > 0 ? id : null
  })

  protected readonly nav = computed<NavItem[]>(() => [
    { key: '', label: this.t('board.all'), href: '/board' },
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

  /** The card a tile draws (the kanban hands back items as it got them, untyped). */
  protected readonly cardOf = computed(() => {
    const byId = new Map((this.cards().data ?? []).map((c) => [c.id, c]))
    return (item: { id: number }) => byId.get(item.id)
  })

  protected readonly projectName = computed(() => {
    const names = new Map((this.projects().data ?? []).map((p) => [p.id, p.name]))
    return (id: number) => names.get(id) ?? ''
  })

  /**
   * The project directory's branch and state. Read again when a round ends or the project
   * changes (the round may have moved it); not live, git has no events to send.
   */
  protected readonly gitState = resource({
    params: () => {
      const p = this.project()
      return p?.repo_path ? { id: p.id, at: p.last_checked_at } : undefined
    },
    loader: ({ params }) => firstValueFrom(this.api.projects({ id: params.id }).git.get()),
  })

  protected due(at: string | Date): boolean {
    return new Date(at).getTime() <= Date.now()
  }

  /** What the project's worker is doing, in one line. */
  protected readonly workerLine = computed(() => {
    const p = this.project()
    if (!p) return ''
    if (p.paused_reason) return this.t('board.workerPaused')
    if (!p.repo_path || !p.worker_enabled) return this.t('board.workerBoardOnly')
    return this.t('board.workerEvery', { minutes: p.interval_minutes })
  })

  // a new card
  protected readonly creating = signal(false)
  /** A form keeps what was typed into it, so each new card gets a form of its own. */
  protected readonly formNumber = signal(0)
  protected readonly error = signal<string | null>(null)
  protected readonly createError = signal('')
  protected readonly busy = signal(false)
  protected readonly registry = REGISTRY
  protected readonly quickAddForm = computed(() => quickAddForm(this.t))
  protected readonly newValue = signal<Record<string, unknown>>({})
  protected readonly newForm = computed<FormDefinition>(() => {
    const form = newCardForm(this.t)
    // the board shows one project, or there is only one: the card goes there, nothing to ask
    const known = this.project() !== null || (this.projects().data ?? []).length <= 1
    return {
      ...form,
      fields: form.fields
        .filter((f) => !(known && f.key === 'project_id'))
        .map((f) =>
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
    }
  })

  // a new cron job, from New ▾
  protected readonly newItems = computed(() => [
    { value: 'cron', label: this.t('board.newCronJob') },
  ])
  protected readonly addingJob = signal(false)
  /** What was just added, with a way to it. */
  protected readonly notice = signal<{ text: string; slug: string } | null>(null)
  protected readonly openProjects = computed(() =>
    (this.projects().data ?? [])
      .filter((p) => !p.archived)
      .map((p) => ({ id: p.id, name: p.name, playbooks: p.playbooks })),
  )
  /** The job goes to the project on screen, else the first. */
  protected readonly jobProject = computed(() => {
    const p = this.project() ?? this.openProjects()[0]
    return p ? String(p.id) : null
  })

  protected addCronJob(): void {
    this.notice.set(null)
    this.addingJob.set(true)
  }

  protected jobAdded(job: { name: string; project: string }): void {
    const slug = (this.projects().data ?? []).find((p) => String(p.id) === job.project)?.slug ?? ''
    this.notice.set({ text: this.t('cron.wizard.added', { name: job.name }), slug })
  }

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
    this.formNumber.update((n) => n + 1)
    this.newValue.set({
      project_id: project ? String(project.id) : null,
      owner: 'autopilot',
      tags: [],
    })
    this.createError.set('')
    this.creating.set(true)
  }

  private async createOne(input: {
    project_id: number
    title: string
    body?: string
    owner: string
    tags?: string[]
  }) {
    const others = (input.tags ?? []).filter((t) => t !== AUTOPILOT)
    const [card] = await firstValueFrom(
      this.api.cards.batch.post({
        cards: [
          {
            project_id: input.project_id,
            title: input.title,
            body: input.body ?? '',
            tags: input.owner === 'autopilot' ? [AUTOPILOT, ...others] : others,
            human: input.owner === 'human',
          },
        ],
      }),
    )
    return card
  }

  protected async create(submitted: Record<string, unknown>): Promise<void> {
    // `newForm` is the new-card form with its project field filled in or left out, so the element
    // cannot say what it holds: this names it once
    const data = submitted as Partial<FormValues<ReturnType<typeof newCardForm>>>
    try {
      const card = await this.createOne({
        // no project field when the board knows it: the one the form started with
        project_id: Number(data.project_id ?? this.newValue()['project_id']),
        title: trimmed(data.title),
        body: data.body ?? '',
        owner: data.owner ?? 'autopilot',
        tags: data.tags ?? [],
      })
      this.creating.set(false)
      if (card) this.open(card.id)
    } catch (error) {
      this.createError.set(describeError(error))
    }
  }

  /** Quick add in To do: a Claude card in this project, titled and nothing else. */
  protected async quickAdd(form: BahtForm): Promise<void> {
    const project = this.project()
    const title = trimmed(dataOf(this.quickAddForm(), form).title)
    if (!project || !title) return
    this.busy.set(true)
    try {
      await this.createOne({ project_id: project.id, title, owner: 'autopilot' })
      form.reset()
    } catch (error) {
      this.error.set(describeError(error))
    } finally {
      this.busy.set(false)
    }
  }

  protected async runNow(): Promise<void> {
    const project = this.project()
    if (!project) return
    try {
      await firstValueFrom(this.api.projects({ id: String(project.id) })['run-now'].post())
    } catch (error) {
      this.error.set(describeError(error))
    }
  }

  /** Moved to a column, or before one of its cards: the move shows at once, the server confirms. */
  protected async move({ id, to, before }: KanbanMove): Promise<void> {
    if (!isStatus(to)) return
    const status = to
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
