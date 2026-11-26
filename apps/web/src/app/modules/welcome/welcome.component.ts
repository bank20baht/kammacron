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

import { I18n } from '../../core/i18n/i18n.service'
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
    .app-logo {
      display: block;
      width: 100%;
      height: auto;
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        size="lg"
        [eyebrow]="t('identity.philosophy')"
        [heading]="t('welcome.heading')"
        [description]="t('welcome.description')"
      >
        <img
          data-slot="art"
          class="app-logo"
          src="/brand/app-icon.webp?v=transparent-2"
          width="768"
          height="512"
          alt=""
          decoding="async"
        />
      </baht-page-header>
      <div class="split">
        <baht-card
          [heading]="t('welcome.progress')"
          [subtitle]="
            remaining() === 0 ? t('welcome.allSet') : t('welcome.left', { count: remaining() })
          "
        >
          <div class="steps">
            <div class="row">
              <baht-badge
                [tone]="toolsOk() ? 'success' : 'warning'"
                [label]="toolsOk() ? t('welcome.step.done') : t('welcome.step.missing')"
              ></baht-badge>
              {{ t('welcome.steps.tools') }}
            </div>
            <div class="row">
              <baht-badge
                [tone]="hasToken() ? 'success' : 'warning'"
                [label]="hasToken() ? t('welcome.step.done') : t('welcome.step.toDo')"
              ></baht-badge>
              {{ t('welcome.steps.token') }}
            </div>
            <div class="row">
              <baht-badge
                [tone]="hasRepo() ? 'success' : 'warning'"
                [label]="hasRepo() ? t('welcome.step.done') : t('welcome.step.toDo')"
              ></baht-badge>
              {{ t('welcome.steps.repo') }}
            </div>
          </div>
        </baht-card>
        <div class="stack">
          <baht-card
            [heading]="t('welcome.tools.heading')"
            [subtitle]="t('welcome.tools.subtitle')"
          >
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
            [heading]="t('welcome.token.heading')"
            [subtitle]="t('welcome.token.subtitle')"
          >
            @if (hasToken()) {
              <p class="muted">{{ t('welcome.token.isSet') }}</p>
            }
            <p class="muted">{{ t('welcome.token.step1') }}</p>
            <div class="row">
              <baht-code code="claude setup-token"></baht-code>
              <baht-copy-button
                text="claude setup-token"
                [label]="t('common.copy')"
              ></baht-copy-button>
            </div>
            <p class="muted">{{ t('welcome.token.step2') }}</p>
            <baht-form #tf="bahtForm" [form]="tokenForm()"></baht-form>
            <div class="row">
              <baht-button variant="primary" [loading]="busy()" (click)="saveAndTest(tf.element)">{{
                t('welcome.token.saveAndTest')
              }}</baht-button>
              @if (result(); as r) {
                <baht-badge [tone]="r.ok ? 'success' : 'danger'" [label]="r.text"></baht-badge>
              }
            </div>
          </baht-card>
          <baht-card
            [heading]="t('welcome.project.heading')"
            [subtitle]="t('welcome.project.subtitle')"
          >
            <div class="row">
              <baht-badge
                [tone]="hasRepo() ? 'success' : 'warning'"
                [label]="hasRepo() ? t('welcome.project.linked') : t('welcome.project.noneYet')"
              ></baht-badge>
              <baht-button variant="secondary" (click)="go('/settings')">{{
                hasRepo() ? t('welcome.project.edit') : t('welcome.project.add')
              }}</baht-button>
            </div>
          </baht-card>
          <div class="row">
            <baht-button variant="primary" (click)="go('/board')">{{
              t('welcome.goBoard')
            }}</baht-button>
            <span class="muted">{{
              remaining() === 0 ? t('welcome.ready') : t('welcome.left', { count: remaining() })
            }}</span>
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
  protected readonly t = inject(I18n).t
  protected readonly tokenForm = computed(() => claudeTokenForm(this.t))
  /** `git version 2.39.5` → `2.39.5`. */
  protected readonly versionOf = (line: string | null) =>
    /\d+(\.\d+)+/.exec(line ?? '')?.[0] ?? this.t('welcome.tools.notFound')
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
      this.result.set({ ok: false, text: this.t('welcome.token.pasteFirst') })
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
        text: test.ok ? this.t('welcome.token.answered') : test.message.slice(0, 80),
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
