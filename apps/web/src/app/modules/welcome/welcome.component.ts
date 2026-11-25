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
import type { BahtForm } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { claudeTokenForm } from '../../shared/forms'

/** First start, finished on this page: the tools, a Claude token (kept and tested here), a repo. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-welcome',
  styles: `
    .split {
      display: grid;
      grid-template-columns: minmax(14rem, 20rem) 1fr;
      gap: var(--baht-space-4);
      align-items: start;
    }
    @media (width < 900px) {
      .split {
        grid-template-columns: 1fr;
      }
    }
    .steps,
    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-3);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2);
    }
    .muted {
      margin: 0;
      color: var(--baht-color-text-muted);
      font-size: var(--baht-text-sm);
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        heading="Welcome to kammacron"
        description="Connect Claude and a repository to start."
      ></baht-page-header>
      <div class="split">
        <baht-card
          heading="Setup progress"
          [subtitle]="remaining() === 0 ? 'All set' : remaining() + ' left'"
        >
          <div class="steps">
            <div class="row">
              <baht-badge
                [tone]="toolsOk() ? 'success' : 'warning'"
                [label]="toolsOk() ? 'done' : 'missing'"
              ></baht-badge>
              Tools
            </div>
            <div class="row">
              <baht-badge
                [tone]="hasToken() ? 'success' : 'warning'"
                [label]="hasToken() ? 'done' : 'to do'"
              ></baht-badge>
              Claude token
            </div>
            <div class="row">
              <baht-badge
                [tone]="hasRepo() ? 'success' : 'warning'"
                [label]="hasRepo() ? 'done' : 'to do'"
              ></baht-badge>
              A project with its repo
            </div>
          </div>
        </baht-card>
        <div class="stack">
          <baht-card heading="Tools" subtitle="On the PATH the worker uses">
            <div class="row">
              @for (tool of system.value()?.tools ?? []; track tool.name) {
                <baht-badge
                  [tone]="tool.path ? 'success' : 'danger'"
                  [label]="tool.name + ' ' + versionOf(tool.version)"
                ></baht-badge>
              }
            </div>
          </baht-card>
          <baht-card
            heading="Claude token"
            subtitle="It uses your Claude subscription. Kept on this machine, in secrets.json."
          >
            @if (hasToken()) {
              <p class="muted">A token is set. Replace it here if it stops working.</p>
            }
            <p class="muted">1. Run this in a terminal:</p>
            <div class="row">
              <baht-code code="claude setup-token"></baht-code>
              <baht-copy-button text="claude setup-token" label="Copy"></baht-copy-button>
            </div>
            <p class="muted">2. Paste the token it prints:</p>
            <baht-form #tf="bahtForm" [form]="tokenForm"></baht-form>
            <div class="row">
              <baht-button variant="primary" [loading]="busy()" (click)="saveAndTest(tf.element)"
                >Save and test</baht-button
              >
              @if (result(); as r) {
                <baht-badge [tone]="r.ok ? 'success' : 'danger'" [label]="r.text"></baht-badge>
              }
            </div>
          </baht-card>
          <baht-card
            heading="Project"
            subtitle="Settings → Projects: add one, set its repo path, turn the worker on"
          >
            <div class="row">
              <baht-badge
                [tone]="hasRepo() ? 'success' : 'warning'"
                [label]="hasRepo() ? 'linked' : 'none yet'"
              ></baht-badge>
              <baht-button variant="secondary" (click)="go('/settings')">{{
                hasRepo() ? 'Edit' : 'Add a project'
              }}</baht-button>
            </div>
          </baht-card>
          <div class="row">
            <baht-button variant="primary" (click)="go('/board')">Go to the board</baht-button>
            <span class="muted">{{ remaining() === 0 ? 'Ready.' : remaining() + ' left' }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class WelcomeComponent {
  private readonly api = inject(Api).client.api
  private readonly router = inject(Router)
  protected readonly system = resource({ loader: () => firstValueFrom(this.api.system.get()) })
  private readonly settings = resource({ loader: () => firstValueFrom(this.api.settings.get()) })
  private readonly projects = resource({
    loader: () => firstValueFrom(this.api.projects.get({ query: {} })),
  })
  protected readonly tokenForm = claudeTokenForm
  /** `git version 2.39.5` → `2.39.5`. */
  protected readonly versionOf = (line: string | null) =>
    /\d+(\.\d+)+/.exec(line ?? '')?.[0] ?? 'not found'
  protected readonly busy = signal(false)
  protected readonly result = signal<{ ok: boolean; text: string } | null>(null)

  protected readonly toolsOk = computed(() =>
    (this.system.value()?.tools ?? []).every((t) => t.path !== null),
  )
  protected readonly hasToken = computed(() => this.settings.value()?.claude_token.source != null)
  protected readonly hasRepo = computed(() =>
    (this.projects.value() ?? []).some((p) => p.repo_path !== null),
  )
  protected readonly remaining = computed(
    () => [this.toolsOk(), this.hasToken(), this.hasRepo()].filter((done) => !done).length,
  )

  protected async saveAndTest(form: BahtForm): Promise<void> {
    const token = form.getData()['token']
    if (typeof token !== 'string' || !token.trim()) {
      this.result.set({ ok: false, text: 'Paste a token first' })
      return
    }
    this.busy.set(true)
    try {
      await firstValueFrom(this.api.settings['claude-token'].put({ token: token.trim() }))
      form.reset()
      this.settings.reload()
      const test = await firstValueFrom(this.api.settings['claude-test'].post())
      this.result.set({
        ok: test.ok,
        text: test.ok ? 'Claude answered' : test.message.slice(0, 80),
      })
    } catch (error) {
      this.result.set({ ok: false, text: describeError(error) })
    } finally {
      this.busy.set(false)
    }
  }

  protected go(url: string): void {
    void this.router.navigateByUrl(url)
  }
}
