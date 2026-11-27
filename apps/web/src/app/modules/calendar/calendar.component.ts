import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type {
  CalendarEvent,
  CalendarNavigateDetail,
  CalendarTone,
  CalendarView,
  ColumnMap,
} from '@20baht/ui'
import { calendarRange } from '@20baht/ui/components/calendar'

import { IllustrationComponent } from '../../shared/illustration/illustration.component'
import { dateLocale, I18n, type Translate } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import {
  dayKey,
  daysWith,
  every,
  FREQUENT_MINUTES,
  gapMinutes,
  occurrences,
  type CronJobLike,
} from '../../shared/cron'
import { ago } from '../../shared/format'
import { narrowScreen } from '../../shared/narrow'
import { runLabel } from '../../shared/schedule'
import { runStatusLabel } from '../runs/runs.component'

type Layer = 'worker' | 'schedule' | 'housekeeping' | 'runs'
const LAYERS: readonly Layer[] = ['worker', 'schedule', 'housekeeping', 'runs']
const VIEWS: readonly CalendarView[] = ['month', 'week', 'day']
const JOB_TONE: Record<string, CalendarTone> = {
  worker: 'primary',
  schedule: 'carbon',
  housekeeping: 'neutral',
}
const RUN_TONE: Record<string, CalendarTone> = {
  running: 'primary',
  succeeded: 'success',
  review: 'warning',
  failed: 'danger',
  stopped: 'neutral',
  stale: 'neutral',
}

const columnsOf = (t: Translate): ColumnMap => ({
  job: t('calendar.column.job'),
  project: t('calendar.column.project'),
  every: t('calendar.column.every'),
  next: t('calendar.column.next'),
  last: t('calendar.column.last'),
  result: t('calendar.column.result'),
  state: {
    label: t('calendar.column.state'),
    cell: 'badge',
    tone: (_value: unknown, row: Record<string, unknown>) =>
      row['on'] === true ? 'success' : 'neutral',
  },
})

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
  cron?: string | null
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
  imports: [IllustrationComponent, BAHT_UI],
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
    /* a phone: the calendar comes up close under a short header, the art small beside the title */
    @media (width < 600px) {
      .app-page {
        gap: var(--baht-space-3);
        padding: var(--baht-space-3);
      }
      baht-page-header {
        --baht-page-header-art-size: 2.5rem;
      }
      .tools {
        gap: var(--baht-space-2);
      }
      .tools .muted {
        display: none;
      }
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        [heading]="t('calendar.heading')"
        [description]="narrow() ? '' : t('calendar.description')"
      >
        <app-illustration data-slot="art" art="calendar" />
      </baht-page-header>
      <div class="tools">
        <span class="muted">{{ t('calendar.show') }}</span>
        <baht-filter
          [label]="t('calendar.show')"
          [options]="layers()"
          [selected]="shown()"
          (bahtChange)="shown.set($any($event).selected)"
        ></baht-filter>
        @if (projectOptions().length > 1) {
          <span class="muted">{{ t('calendar.project') }}</span>
          <baht-filter
            [label]="t('calendar.project')"
            [options]="projectOptions()"
            [selected]="project()"
            (bahtChange)="project.set($any($event).selected.slice(-1))"
          ></baht-filter>
        }
      </div>
      @if (calendar().error) {
        <baht-alert tone="danger" [message]="t('calendar.loadFailed')"></baht-alert>
      }
      <baht-calendar
        [label]="t('calendar.label')"
        [locale]="locale()"
        [view]="view()"
        [date]="date()"
        [events]="events()"
        (bahtNavigate)="navigate($event)"
        (bahtEventOpen)="open($event.id)"
      ></baht-calendar>
      <baht-card [heading]="t('calendar.jobs')" [subtitle]="t('calendar.jobsSubtitle')">
        <baht-table
          [showIndex]="false"
          [columns]="jobColumns()"
          [items]="jobRows()"
          [total]="jobRows().length"
          [loading]="!calendar().data"
          clickable
          [emptyMessage]="t('calendar.noJobs')"
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

  protected readonly t = inject(I18n).t
  /** Dates as Intl writes them for the locale (`en` → `en-GB`, the calendar's own default). */
  protected readonly locale = dateLocale
  protected readonly layers = computed(() =>
    LAYERS.map((key) => ({ key, label: this.t(`calendar.layer.${key}`) })),
  )
  protected readonly jobColumns = computed(() => columnsOf(this.t))
  protected readonly shown = signal<string[]>([...LAYERS])
  protected readonly project = signal<string[]>([])
  private readonly picked = signal<{ view: CalendarView; date: string } | null>(null)
  protected readonly narrow = narrowScreen()
  /**
   * The view when none is asked for: a phone opens on today's day (a week does not fit across it),
   * a wider window on the week. Read once: turning or resizing the window never swaps the view.
   */
  private readonly firstView: CalendarView = untracked(this.narrow) ? 'day' : 'week'

  protected readonly view = computed<CalendarView>(() => {
    const wanted = this.picked()?.view ?? this.viewParam()
    return VIEWS.find((v) => v === wanted) ?? this.firstView
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
      job: j.command
        ? this.t('calendar.jobWithCommand', { name: this.nameOf(j), command: j.command })
        : this.nameOf(j),
      project: j.project_name ?? '—',
      every: every(this.t, j.every_minutes),
      next: j.off ? '—' : ago(j.next_at),
      last: ago(j.last_at),
      result: j.last_result ?? '—',
      // the reason a job is off is the server's words
      state: j.off ? this.t('calendar.off', { reason: j.off }) : this.t('calendar.on'),
      on: !j.off,
    })),
  )

  /** A job's times ahead, dashed: one line a day for a frequent job, else a mark per run. */
  private jobEvents(job: Job, from: Date, to: Date): Drawn[] {
    const target = this.targetOf(job)
    const meta = [job.project_name, job.command].filter(Boolean).join(' · ')
    const tone = JOB_TONE[job.kind] ?? 'neutral'
    const times = occurrences(job, from, to)
    if (gapMinutes(job, times) < FREQUENT_MINUTES)
      return daysWith(times).map((day) => ({
        target,
        event: {
          id: `${job.key}@${day}`,
          title: this.t('calendar.frequentTitle', {
            name: this.nameOf(job),
            every: job.cron ?? every(this.t, job.every_minutes),
          }),
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
        title: this.nameOf(job),
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
          title: runLabel(run),
          start: new Date(run.started_at).toISOString(),
          end: new Date(run.ended_at ?? Date.now()).toISOString(),
          tone: RUN_TONE[run.status] ?? 'neutral',
          meta: this.t('calendar.runMeta', {
            project: name(run.project_id),
            id: run.id,
            status: runStatusLabel(this.t, run.status),
          }),
        },
      }))
  }

  /** A job's name: the worker round and housekeeping in the locale's words, a schedule its own. */
  private nameOf(job: { kind: string; name: string }): string {
    if (job.kind === 'worker') return this.t('calendar.job.worker')
    if (job.kind === 'housekeeping') return this.t('calendar.job.housekeeping')
    return job.name
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
