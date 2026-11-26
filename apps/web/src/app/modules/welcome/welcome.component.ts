import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { Api } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'

/** First start: the tools on the PATH, and a first project. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-welcome',
  styles: `
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
      <div class="stack">
        <baht-card [heading]="t('welcome.tools.heading')" [subtitle]="t('welcome.tools.subtitle')">
          <div class="row">
            @for (tool of system.value()?.tools ?? []; track tool.name) {
              <baht-badge
                [tone]="tool.path ? 'success' : 'neutral'"
                [label]="tool.name + ' ' + versionOf(tool.version)"
              ></baht-badge>
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
        </div>
      </div>
    </div>
  `,
})
export class WelcomeComponent {
  private readonly api = inject(Api).client.api
  private readonly router = inject(Router)
  protected readonly system = resource({ loader: () => firstValueFrom(this.api.system.get()) })
  private readonly projects = resource({
    loader: () => firstValueFrom(this.api.projects.get({ query: {} })),
  })
  protected readonly t = inject(I18n).t
  /** `git version 2.39.5` → `2.39.5`. */
  protected readonly versionOf = (line: string | null) =>
    /\d+(\.\d+)+/.exec(line ?? '')?.[0] ?? this.t('welcome.tools.notFound')
  protected readonly hasRepo = computed(() =>
    (this.projects.value() ?? []).some((p) => p.repo_path !== null),
  )

  protected go(url: string): void {
    void this.router.navigateByUrl(url)
  }
}
