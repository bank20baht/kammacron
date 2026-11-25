import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { BahtForm } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { LiveService } from '../../services/live.service'
import { ago } from '../../shared/format'
import { accessForm, claudeTokenForm, newProjectForm, workerForm } from '../../shared/forms'

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** The install: Claude's token, MCP, pause, hosts, notifications, the tools found; and the projects. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-settings',
  styleUrl: './settings.component.css',
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  private readonly api = inject(Api).client.api
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)

  protected readonly settings = resource({ loader: () => firstValueFrom(this.api.settings.get()) })
  protected readonly system = resource({ loader: () => firstValueFrom(this.api.system.get()) })
  protected readonly token = resource({ loader: () => firstValueFrom(this.api.token.get()) })
  protected readonly projects = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects', { query: {} }),
  )

  protected readonly message = signal<{ tone: 'success' | 'danger'; text: string } | null>(null)
  protected readonly busy = signal(false)
  protected readonly ago = ago
  protected readonly forms = {
    claudeToken: claudeTokenForm,
    worker: workerForm,
    access: accessForm,
    newProject: newProjectForm,
  }

  protected readonly workerValue = computed(() => {
    const s = this.settings.value()
    return s
      ? {
          stale_minutes: s.stale_minutes,
          concurrency: s.concurrency,
          worker_path: s.worker_path ?? '',
        }
      : {}
  })
  protected readonly accessValue = computed(() => {
    const s = this.settings.value()
    return s
      ? {
          allowed_hosts: s.allowed_hosts,
          webhook_url: s.webhook_url ?? '',
          desktop_notifications: s.desktop_notifications,
          public_url: s.public_url ?? '',
        }
      : {}
  })

  protected readonly mcpCommand = computed(() => {
    const token = this.token.value()?.token ?? '…'
    return `claude mcp add --transport http kammacron ${globalThis.location.origin}/mcp --header "Authorization: Bearer ${token}"`
  })

  private async act(work: () => Promise<unknown>, done: string): Promise<void> {
    this.busy.set(true)
    this.message.set(null)
    try {
      await work()
      this.message.set({ tone: 'success', text: done })
      this.settings.reload()
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    } finally {
      this.busy.set(false)
    }
  }

  protected save(patch: Parameters<typeof this.api.settings.patch>[0]): Promise<void> {
    return this.act(() => firstValueFrom(this.api.settings.patch(patch)), 'Saved')
  }

  protected saveToken(form: BahtForm): Promise<void> {
    const token = text(form.getData()['token'])
    return this.act(
      async () => {
        await firstValueFrom(this.api.settings['claude-token'].put({ token }))
        form.reset()
      },
      token ? 'Token kept' : 'Token cleared',
    )
  }

  protected async testClaude(): Promise<void> {
    this.busy.set(true)
    try {
      const r = await firstValueFrom(this.api.settings['claude-test'].post())
      this.message.set({
        tone: r.ok ? 'success' : 'danger',
        text: r.ok ? `Claude answered: ${r.message}` : r.message,
      })
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    } finally {
      this.busy.set(false)
    }
  }

  protected saveWorker(form: BahtForm): Promise<void> {
    if (!form.validate().valid) return Promise.resolve()
    const d = form.getData()
    return this.save({
      stale_minutes: Math.round(Number(d['stale_minutes'])),
      concurrency: Math.round(Number(d['concurrency'])),
      worker_path: text(d['worker_path']) || null,
    })
  }

  protected saveAccess(form: BahtForm): Promise<void> {
    const d = form.getData()
    return this.save({
      allowed_hosts: Array.isArray(d['allowed_hosts']) ? (d['allowed_hosts'] as string[]) : [],
      webhook_url: text(d['webhook_url']) || null,
      desktop_notifications: d['desktop_notifications'] === true,
      public_url: text(d['public_url']).replace(/\/+$/, '') || null,
    })
  }

  protected rotate(): Promise<void> {
    return this.act(async () => {
      await firstValueFrom(this.api.token.rotate.post())
      this.token.reload()
    }, 'New token: update every `claude mcp add` that used the old one')
  }

  protected async addProject(form: BahtForm): Promise<void> {
    if (!form.validate().valid) return
    const d = form.getData()
    this.busy.set(true)
    try {
      const created = await firstValueFrom(
        this.api.projects.post({ slug: text(d['slug']), name: text(d['name']) }),
      )
      form.reset()
      void this.router.navigate(['/settings/projects', created.id])
    } catch (error) {
      this.message.set({ tone: 'danger', text: describeError(error) })
    } finally {
      this.busy.set(false)
    }
  }

  protected openProject(id: number): void {
    void this.router.navigate(['/settings/projects', id])
  }
}
