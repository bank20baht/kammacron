import { Injectable, inject } from '@angular/core'
import { Api, type ContactMessage } from '@kammacron/kit'
import type { BahtTableQuery } from '@20baht/angular'
import { edenResource } from '@20baht/ngx-eden'

/** The contact form and the list of what it received: both declared once, on the server. */
@Injectable({ providedIn: 'root' })
export class ContactService {
  private readonly api = inject(Api).client.api

  /** `GET /api/contact/form` as a resource; create it in an injection context (a field initializer). */
  form() {
    return edenResource(() => this.api.contact.form.get.$request())
  }

  /**
   * `POST /api/contact`: the server validates with the schema the form was rendered from.
   * `ContactMessage` is derived from that schema, so a field added there is asked for here.
   */
  send(data: ContactMessage) {
    return this.api.contact.post(data)
  }

  /** `GET /api/contact/table`: the columns of the list, declared from the form. */
  table() {
    return edenResource(() => this.api.contact.table.get.$request())
  }

  /** `POST /api/contact/search`: one page of the list for a query (filter, sort, page). */
  search(query: BahtTableQuery<'received_at' | 'name' | 'email' | 'message'>) {
    return this.api.contact.search.post(query)
  }
}
