import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import { Api } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

/** First start: are bun, git and claude here, is there a token, is there a project. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-welcome',
  styles: `
    .steps {
      display: flex;
      flex-direction: column;
      gap: var(--baht-space-3);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--baht-space-2);
    }
    .muted {
      color: var(--baht-color-text-muted);
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        heading="Welcome to kammacron"
        description="Three things before Claude can take a card."
      ></baht-page-header>
      <div class="steps">
        <baht-card heading="1. The tools" subtitle="On the PATH the worker uses">
          @for (tool of system.value()?.tools ?? []; track tool.name) {
            <div class="row">
              <baht-badge
                [tone]="tool.path ? 'success' : 'danger'"
                [label]="tool.name"
              ></baht-badge>
              <span class="muted">{{ tool.version ?? 'not found' }}</span>
            </div>
          }
        </baht-card>
        <baht-card
          heading="2. A Claude token"
          subtitle="claude setup-token prints one; it uses your subscription"
        >
          <div class="row">
            <baht-badge
              [tone]="hasToken() ? 'success' : 'warning'"
              [label]="hasToken() ? 'set' : 'not set'"
            ></baht-badge>
            <baht-button variant="secondary" (click)="go('/settings')">Settings</baht-button>
          </div>
        </baht-card>
        <baht-card
          heading="3. A project with its repo"
          subtitle="Settings → Projects: add one, set its repo path, turn the worker on"
        >
          <div class="row">
            <baht-badge
              [tone]="hasRepo() ? 'success' : 'warning'"
              [label]="hasRepo() ? 'linked' : 'none yet'"
            ></baht-badge>
            <baht-button variant="secondary" (click)="go('/settings')">Projects</baht-button>
          </div>
        </baht-card>
        <baht-button variant="primary" (click)="go('/board')">Go to the board</baht-button>
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
  protected readonly hasToken = computed(() => this.settings.value()?.claude_token.source != null)
  protected readonly hasRepo = computed(() =>
    (this.projects.value() ?? []).some((p) => p.repo_path !== null),
  )

  protected go(url: string): void {
    void this.router.navigateByUrl(url)
  }
}
