import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { describeError, type ContactMessage, type ContactRow } from '@kammacron/kit'
import { BAHT_UI, BahtTableOfDirective, type BahtTableQuery } from '@20baht/angular'
import { ContactService } from '../../services/contact.service'

/** A query of the list: the columns the server's table has. */
type ContactQuery = BahtTableQuery<'received_at' | 'name' | 'email' | 'message'>

/**
 * A form from a schema: `<baht-form>` renders and checks it in the browser, the server checks
 * the same schema again. This is the whole of "a form" in this app; nothing else is needed.
 *
 * The schema is typed where it is declared (`defineForm`, in the server), and the type comes
 * along: `$event.data` of `(bahtSubmit)` is `ContactMessage`, so a field renamed in the schema
 * is a compile error here, not a surprise in production.
 *
 * Below it, the list of what was received: `<baht-table [table]>` takes the table the server
 * declared from the same form, and asks the server for each page (`(queryChange)`). Sorting,
 * filtering and searching are the server's work; the table only asks. The search box above it is
 * the app's own (`[term]`); the boxes under the headers are the table's (`column-search`).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, BahtTableOfDirective],
  selector: 'web-contact',
  styles: `
    .actions {
      display: flex;
      gap: var(--baht-space-3);
      margin-top: var(--baht-space-4);
    }
    .search {
      display: block;
      max-width: 320px;
      margin-bottom: var(--baht-space-3);
    }
  `,
  template: `
    <div class="app-page">
      <baht-page-header
        heading="Contact"
        description="One schema: rendered here, validated again on the server."
      ></baht-page-header>
      <baht-card heading="Send a message">
        @if (schema.error(); as error) {
          <baht-error-state
            heading="The form could not be loaded"
            [message]="describeError(error)"
            retry-label="Try again"
            (bahtRetry)="schema.reload()"
          ></baht-error-state>
        } @else if (schema.value(); as form) {
          <baht-form
            #contact="bahtForm"
            [form]="form"
            [busy]="sending()"
            submit-on-enter
            (bahtSubmit)="send($event.data)"
          ></baht-form>
          <div class="actions">
            <baht-button [loading]="sending()" (click)="contact.element.submit()">Send</baht-button>
          </div>
        } @else {
          <baht-skeleton variant="text"></baht-skeleton>
        }
      </baht-card>
      @if (failed(); as message) {
        <baht-alert tone="danger" [message]="message"></baht-alert>
      }
      <baht-card heading="Messages received">
        @if (table.value(); as columns) {
          <baht-search
            class="search"
            label="Search messages"
            placeholder="Search messages"
            (bahtSearch)="term.set($event.value)"
          ></baht-search>
          <baht-table
            [table]="columns"
            [items]="rows()"
            [total]="total()"
            [loading]="loading()"
            [showIndex]="false"
            [term]="term()"
            empty-message="Nothing yet. Send a message above."
            sortable
            filterable
            column-search
            (queryChange)="load($event)"
          ></baht-table>
        } @else {
          <baht-skeleton variant="text"></baht-skeleton>
        }
      </baht-card>
    </div>
  `,
})
export class ContactComponent {
  private readonly contact = inject(ContactService)
  protected readonly schema = this.contact.form()
  protected readonly describeError = describeError
  protected readonly sending = signal(false)
  protected readonly failed = signal<string | null>(null)
  /** The list's columns come from the server too: declared there from the form (`defineTable`). */
  protected readonly table = this.contact.table()
  protected readonly rows = signal<ContactRow[]>([])
  protected readonly total = signal(0)
  protected readonly loading = signal(false)
  /** What is typed into the search box above the table: looked for in any column. */
  protected readonly term = signal('')
  /** What the table last asked for, asked again after a message is sent. */
  private query: ContactQuery = { page: 1 }

  constructor() {
    this.load(this.query)
  }

  /** `(queryChange)`: the table sorted, filtered, searched or changed page. The server answers. */
  protected load(query: ContactQuery): void {
    this.query = query
    this.loading.set(true)
    this.contact.search(query).subscribe({
      next: (page) => {
        this.rows.set(page.rows)
        this.total.set(page.total)
        this.loading.set(false)
      },
      error: (error: unknown) => {
        this.failed.set(describeError(error))
        this.loading.set(false)
      },
    })
  }

  protected send(data: ContactMessage): void {
    this.sending.set(true)
    this.failed.set(null)
    this.contact.send(data).subscribe({
      next: () => {
        this.sending.set(false)
        this.load(this.query)
      },
      error: (error: unknown) => {
        this.failed.set(describeError(error))
        this.sending.set(false)
      },
    })
  }
}
