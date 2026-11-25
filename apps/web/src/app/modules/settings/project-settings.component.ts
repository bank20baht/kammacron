import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { BahtForm } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { projectForm, scheduleForm } from '../../shared/forms'

type Check = {
  ok: boolean
  checks: { name: string; ok: boolean; detail: string }[]
  default_branch: string | null
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const count = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? n : fallback
}
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : [])

/** One project's settings, the repo checklist, Run now, and its schedules. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-project-settings',
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2);
      margin-block: var(--baht-space-2);
    }
    .muted {
      color: var(--baht-color-text-muted);
    }
  `,
  templateUrl: './project-settings.component.html',
})
export class ProjectSettingsComponent {
  private readonly api = inject(Api).client.api
  private readonly live = inject(LiveService).live
  readonly id = input.required<string>()

  protected readonly project = resource({
    params: () => this.id(),
    loader: ({ params }) => firstValueFrom(this.api.projects({ id: params }).get()),
  })
  protected readonly schedules = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects/:id/schedules', { params: { id: this.id() } }),
  )
  protected readonly check = signal<Check | null>(null)
  protected readonly message = signal<{ tone: 'success' | 'danger'; text: string } | null>(null)
  protected readonly busy = signal(false)
  protected readonly ago = ago
  protected readonly projectForm = projectForm
  protected readonly scheduleForm = scheduleForm
  protected readonly scheduleValue = { interval_minutes: 1440 }

  protected readonly value = computed(() => {
    const p = this.project.value()
    if (!p) return {}
    return {
      ...p,
      repo_path: p.repo_path ?? '',
      default_branch: p.default_branch ?? '',
      model: p.model ?? '',
      setup_command: p.setup_command ?? '',
      verify_command: p.verify_command ?? '',
    }
  })

  private async act(work: () => Promise<unknown>, done: string): Promise<void> {
    this.busy.set(true)
    this.message.set(null)
    try {
      await work()
      this.message.set({ tone: 'success', text: done })
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    } finally {
      this.busy.set(false)
    }
  }

  protected save(form: BahtForm): Promise<void> {
    if (!form.validate().valid) return Promise.resolve()
    const d = form.getData()
    return this.act(async () => {
      await firstValueFrom(
        this.api.projects({ id: this.id() }).patch({
          name: text(d['name']) ?? '',
          repo_path: text(d['repo_path']),
          default_branch: text(d['default_branch']),
          worker_enabled: d['worker_enabled'] === true,
          mode: d['mode'] === 'watch' ? 'watch' : 'autopilot',
          ship_policy: d['ship_policy'] === 'branch' ? 'branch' : 'push',
          interval_minutes: count(d['interval_minutes'], 30),
          max_cards_per_run: count(d['max_cards_per_run'], 3),
          max_turns: count(d['max_turns'], 60),
          model: text(d['model']),
          allowed_bash: list(d['allowed_bash']),
          web_tools: d['web_tools'] === true,
          enabled_mcp_servers: list(d['enabled_mcp_servers']),
          copy_files: list(d['copy_files']),
          setup_command: text(d['setup_command']),
          verify_command: text(d['verify_command']),
          extra_prompt: typeof d['extra_prompt'] === 'string' ? d['extra_prompt'] : '',
          max_diff_lines:
            Number(d['max_diff_lines']) > 0 ? Math.round(Number(d['max_diff_lines'])) : null,
          protected_paths: list(d['protected_paths']),
        }),
      )
      this.project.reload()
      if (text(d['repo_path'])) await this.runCheck()
    }, 'Saved')
  }

  protected async runCheck(): Promise<void> {
    try {
      this.check.set(
        await firstValueFrom(this.api.projects({ id: this.id() })['check-repo'].post()),
      )
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    }
  }

  protected runNow(): Promise<void> {
    return this.act(
      () => firstValueFrom(this.api.projects({ id: this.id() })['run-now'].post()),
      'A round is queued: watch the board and Runs',
    )
  }

  protected resume(): Promise<void> {
    return this.act(async () => {
      await firstValueFrom(this.api.projects({ id: this.id() }).resume.post())
      this.project.reload()
    }, 'Resumed')
  }

  protected addSchedule(form: BahtForm): Promise<void> {
    if (!form.validate().valid) return Promise.resolve()
    const d = form.getData()
    return this.act(async () => {
      await firstValueFrom(
        this.api.projects({ id: this.id() }).schedules.post({
          name: text(d['name']) ?? '',
          command: text(d['command']) ?? '',
          interval_minutes: count(d['interval_minutes'], 1440),
        }),
      )
      form.reset()
    }, 'Schedule added')
  }

  protected toggleSchedule(id: number, enabled: boolean): Promise<void> {
    return this.act(
      () => firstValueFrom(this.api.schedules({ id: String(id) }).patch({ enabled })),
      enabled ? 'On' : 'Off',
    )
  }
}
