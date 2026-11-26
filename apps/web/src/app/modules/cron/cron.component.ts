import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { liveSignal } from '@20baht/angular/live'
import type { TabItem } from '@20baht/ui'

import { I18n } from '../../core/i18n/i18n.service'
import { LiveService } from '../../services/live.service'
import { IllustrationComponent } from '../../shared/illustration/illustration.component'
import { CronJobsComponent } from './cron-jobs.component'
import { UsageLimitsComponent } from './limits.component'

/**
 * Cron jobs, where they are looked for: a project picked with tabs (`?project=<slug>`, the first
 * one by default), its jobs and the form that adds one.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, CronJobsComponent, IllustrationComponent, UsageLimitsComponent],
  selector: 'web-cron',
  styles: `
    .projects {
      max-width: 100%;
      overflow-x: auto;
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header [heading]="t('cron.heading')" [description]="t('cron.description')">
        <app-illustration data-slot="art" art="clock" />
      </baht-page-header>
      <web-usage-limits></web-usage-limits>
      @if (projects().data; as list) {
        @if (list.length === 0) {
          <baht-empty-state [message]="t('cron.noProject')" [hint]="t('cron.noProjectHelp')">
            <app-illustration data-slot="art" art="clock" />
          </baht-empty-state>
          <div>
            <baht-button variant="primary" (click)="go('/settings')">{{
              t('cron.addProject')
            }}</baht-button>
          </div>
        } @else {
          @if (list.length > 1) {
            <div class="projects">
              <baht-tabs
                variant="pill"
                [label]="t('cron.project')"
                [tabs]="tabs()"
                [value]="current()?.slug ?? ''"
                (bahtChange)="pick($any($event).value)"
              ></baht-tabs>
            </div>
          }
          @if (current(); as p) {
            <web-cron-jobs [projectId]="'' + p.id" [playbooks]="p.playbooks"></web-cron-jobs>
          }
        }
      } @else {
        <baht-skeleton variant="text"></baht-skeleton>
      }
    </div>
  `,
})
export class CronComponent {
  private readonly live = inject(LiveService).live
  private readonly router = inject(Router)
  protected readonly t = inject(I18n).t
  /** `?project=<slug>`: the project whose jobs are shown. */
  readonly project = input<string>()

  protected readonly projects = liveSignal(() =>
    this.live.subscribe('GET', '/api/projects', { query: {} }),
  )
  private readonly open = computed(() => (this.projects().data ?? []).filter((p) => !p.archived))
  protected readonly tabs = computed<TabItem[]>(() =>
    this.open().map((p) => ({ key: p.slug, label: p.name })),
  )
  protected readonly current = computed(() => {
    const list = this.open()
    return list.find((p) => p.slug === this.project()) ?? list[0]
  })

  protected pick(slug: string): void {
    void this.router.navigate([], { queryParams: { project: slug }, replaceUrl: true })
  }

  protected go(url: string): void {
    void this.router.navigateByUrl(url)
  }
}
