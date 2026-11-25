import { Injectable, inject } from '@angular/core'
import { Api } from '@kammacron/kit'
import { edenResource } from '@20baht/ngx-eden'

/** Everything the home page asks the server. */
@Injectable({ providedIn: 'root' })
export class HelloService {
  private readonly api = inject(Api).client.api

  /** `GET /api/hello` as a resource; create it in an injection context (a field initializer). */
  hello() {
    return edenResource(() => this.api.hello.get.$request())
  }
}
