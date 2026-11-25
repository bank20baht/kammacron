import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { describeError } from '@kammacron/kit'
import { BAHT_UI } from '@20baht/angular'
import { HelloService } from '../../services/hello.service'

/** The landing page: what the server says at `GET /api/hello`. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-home',
  template: `
    <div class="app-page">
      <baht-page-header
        heading="kammacron"
        description="An Angular app on @20baht/ui, talking to an Elysia server through a typed client."
      ></baht-page-header>
      <baht-card heading="From the server">
        @if (hello.error(); as error) {
          <baht-error-state
            heading="The server did not answer"
            [message]="describeError(error)"
            retry-label="Try again"
            (bahtRetry)="hello.reload()"
          ></baht-error-state>
        } @else if (hello.value(); as projects) {
          <p [textContent]="projects.length + ' projects'"></p>
        } @else {
          <baht-skeleton variant="text"></baht-skeleton>
        }
      </baht-card>
    </div>
  `,
})
export class HomeComponent {
  protected readonly hello = inject(HelloService).projects()
  protected readonly describeError = describeError
}
