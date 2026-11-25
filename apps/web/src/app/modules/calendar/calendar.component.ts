import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import {
  calendarRange,
  type CalendarEvent,
  type CalendarNavigateDetail,
  type CalendarTone,
  type CalendarView,
  type ColumnMap,
} from '@20baht/ui'

import { LiveService } from '../../services/live.service'
import {
  dayKey,
  daysWith,
  every,
  FREQUENT_MINUTES,
  occurrences,
  type CronJobLike,
} from '../../shared/cron'
import { ago } from '../../shared/format'

type Layer = 'worker' | 'schedule' | 'housekeeping' | 'runs'
const LAYERS: { key: Layer; label: string }[] = [
  { key: 'worker', label: 'Worker rounds' },
  { key: 'schedule', label: 'Schedules' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'runs', label: 'Runs' },
]
const VIEWS: readonly CalendarView[] = ['month', 'week', 'day']
const JOB_TONE: Record<string, CalendarTone> = {
  worker: 'primary',
  schedule: 'carbon',
  housekeeping: 'neutral',
}
const RUN_TONE: Record<string, CalendarTone> = {
  running: 'primary',
  verifying: 'primary',
  succeeded: 'success',
  review: 'warning',
  failed: 'danger',
  reverted: 'danger',
  stopped: 'neutral',
  stale: 'neutral',
}

const JOB_COLUMNS: ColumnMap = {
  job: 'Job',
  project: 'Project',
  every: 'Runs',
  next: 'Next',
  last: 'Last',
  result: 'Last result',
  state: {
    label: 'State',
    cell: 'badge',
    tone: (value: unknown) => (value === 'on' ? 'success' : 'neutral'),
  },
}

type Drawn = { event: CalendarEvent; target: string }

/** A job of `GET /api/calendar`, as far as the page reads it. */
type Job = CronJobLike & {
  key: string
  kind: string
  name: string
  project_id: number | null
  project_name: string | null
  project_slug: string | null
  command: string | null
}

/** Local midnight of a `YYYY-MM-DD` day, `days` later. */
const midnight = (key: string, days = 0): Date => {
  const [y = 0, m = 1, d = 1] = key.split('-').map(Number)
  return new Date(y, m - 1, d + days)
}
const validDay = (key: string | undefined): key is string =>
  !!key && /^\d{4}-\d{2}-\d{2}$/.test(key) && dayKey(midnight(key)) === key

/**
 * What runs on its own, and when: each project's worker round and schedules, the daily
 * housekeeping, ahead as dashed marks; the runs that happened, as blocks. Read-only: a click
 * opens the run, the board or the project's schedules.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-calendar',
  styles: `
    .tools {
      display: flex;
      flex-wrap: wrap;
      gap: var(--baht-space-3);
      align-items: center;
    }
    .muted {
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        heading="Calendar"
        description="What runs on its own and when: worker rounds, schedules and housekeeping ahead (dashed), the runs that happened (solid)."
      ></baht-page-header>
      <div class="tools">
        <span class="muted">Show</span>
        <baht-filter
          label="Show"
          [options]="layers"
          [selected]="shown()"
          (bahtChange)="shown.set($any($event).selected)"
        ></baht-filter>
        @if (projectOptions().length > 1) {
          <span class="muted">Project</span>
          <baht-filter
            label="Project"
            [options]="projectOptions()"
            [selected]="project()"
            (bahtChange)="project.set($any($event).selected.slice(-1))"
          ></baht-filter>
        }
      </div>
      @if (calendar().error) {
        <baht-alert
          tone="danger"
          message="The calendar did not load. Try again in a moment."
        ></baht-alert>
      }
      <baht-calendar
        label="Cron calendar"
        [view]="view()"
        [date]="date()"
        [events]="events()"
        (bahtNavigate)="navigate($event)"
        (bahtEventOpen)="open($event.id)"
      ></baht-calendar>
      <baht-card heading="Jobs" subtitle="Everything on a timer, and why a job that is off is off">
        <baht-table
          [showIndex]="false"
          [columns]="jobColumns"
          [items]="jobRows()"
          [total]="jobRows().length"
          [loading]="!calendar().data"
          clickable
          empty-message="No jobs"
          (bahtRowClick)="open($any($event).row.id)"
        ></baht-table>
      </baht-card>
    </div>
  `,
})
export class CalendarComponent {
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)

  /** `?view=month&date=2026-11-25` keeps the place across a reload. */
  readonly viewParam = input<string>(undefined, { alias: 'view' })
  readonly dateParam = input<string>(undefined, { alias: 'date' })

  protected readonly layers = LAYERS
  protected readonly jobColumns = JOB_COLUMNS
  protected readonly shown = signal<string[]>(LAYERS.map((l) => l.key))
  protected readonly project = signal<string[]>([])
  private readonly picked = signal<{ view: CalendarView; date: string } | null>(null)

  protected readonly view = computed<CalendarView>(() => {
    const wanted = this.picked()?.view ?? this.viewParam()
    return VIEWS.find((v) => v === wanted) ?? 'week'
  })
  protected readonly date = computed(() => {
    const wanted = this.picked()?.date ?? this.dateParam()
    return validDay(wanted) ? wanted : dayKey(new Date())
  })
  /** The instants the view shows: local midnight of its first day to that after its last. */
  private readonly range = computed(() => {
    const { from, to } = calendarRange(this.view(), this.date())
    return { from: midnight(from), to: midnight(to, 1) }
  })

  protected readonly calendar = liveSignal(() =>
    this.live.subscribe('GET', '/api/calendar', {
      query: {
        from: this.range().from.toISOString(),
        to: this.range().to.toISOString(),
      },
    }),
  )
  private readonly projects = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects', { query: {} }),
  )
  protected readonly projectOptions = computed(() =>
    (this.projects().data ?? []).map((p) => ({ key: String(p.id), label: p.name })),
  )
  private readonly projectName = computed(() => {
    const names = new Map((this.projects().data ?? []).map((p) => [p.id, p.name]))
    return (id: number) => names.get(id) ?? ''
  })

  private readonly jobs = computed(() => {
    const only = this.project()[0]
    return (this.calendar().data?.jobs ?? []).filter(
      (j) => only === undefined || j.project_id === null || String(j.project_id) === only,
    )
  })

  /** Each event, and where a click on it goes. */
  private readonly drawn = computed((): Drawn[] => {
    const shown = new Set(this.shown())
    const { from, to } = this.range()
    return [
      ...this.jobs()
        .filter((job) => shown.has(job.kind))
        .flatMap((job) => this.jobEvents(job, from, to)),
      ...(shown.has('runs') ? this.runEvents() : []),
    ]
  })
  protected readonly events = computed(() => this.drawn().map((d) => d.event))

  protected readonly jobRows = computed(() =>
    this.jobs().map((j) => ({
      id: j.key,
      job: j.command ? `${j.name} (${j.command})` : j.name,
      project: j.project_name ?? '—',
      every: every(j.every_minutes),
      next: j.off ? '—' : ago(j.next_at),
      last: ago(j.last_at),
      result: j.last_result ?? '—',
      state: j.off ? `off: ${j.off}` : 'on',
    })),
  )

  /** A job's times ahead, dashed: one line a day for a frequent job, else a mark per run. */
  private jobEvents(job: Job, from: Date, to: Date): Drawn[] {
    const target = this.targetOf(job)
    const meta = [job.project_name, job.command].filter(Boolean).join(' · ')
    const tone = JOB_TONE[job.kind] ?? 'neutral'
    const times = occurrences(job, from, to)
    if (job.every_minutes < FREQUENT_MINUTES)
      return daysWith(times).map((day) => ({
        target,
        event: {
          id: `${job.key}@${day}`,
          title: `${job.name} · ${every(job.every_minutes)}`,
          start: day,
          allDay: true,
          outline: true,
          tone,
          meta,
        },
      }))
    return times.map((at) => ({
      target,
      event: {
        id: `${job.key}@${at.toISOString()}`,
        title: job.name,
        start: at.toISOString(),
        outline: true,
        tone,
        meta,
      },
    }))
  }

  /** The runs that happened, solid, coloured by how they ended. */
  private runEvents(): Drawn[] {
    const only = this.project()[0]
    const name = this.projectName()
    return (this.calendar().data?.runs ?? [])
      .filter((run) => only === undefined || String(run.project_id) === only)
      .map((run) => ({
        target: `/runs/${String(run.id)}`,
        event: {
          id: `run:${String(run.id)}`,
          title: `#${String(run.card_id)} ${run.card_title}`,
          start: new Date(run.started_at).toISOString(),
          end: new Date(run.ended_at ?? Date.now()).toISOString(),
          tone: RUN_TONE[run.status] ?? 'neutral',
          meta: `${name(run.project_id)} · run ${String(run.id)} · ${run.status}`,
        },
      }))
  }

  private targetOf(job: {
    kind: string
    project_id: number | null
    project_slug: string | null
  }): string {
    if (job.kind === 'worker' && job.project_slug) return `/board/${job.project_slug}`
    if (job.kind === 'schedule' && job.project_id !== null)
      return `/settings/projects/${String(job.project_id)}?section=schedules`
    return '/settings'
  }

  protected navigate(detail: CalendarNavigateDetail): void {
    this.picked.set({ view: detail.view, date: detail.date })
    void this.router.navigate([], {
      queryParams: { view: detail.view, date: detail.date },
      replaceUrl: true,
    })
  }

  protected open(id: string): void {
    const job = this.jobs().find((j) => j.key === id)
    const target =
      this.drawn().find((d) => d.event.id === id)?.target ?? (job && this.targetOf(job))
    if (target) void this.router.navigateByUrl(target)
  }
}
