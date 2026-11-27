import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import type { FormDefinition, FormValues } from '@20baht/ui/engine'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { trimmed } from '../../shared/form-data'
import { newCardForm, REGISTRY } from '../../shared/forms'
import { newCardBody } from './new-card'

// the elements this component's template draws: they arrive with it (see src/elements.ts)
import '@20baht/ui/components/form-modal'

/** The New card modal: which project (when the board cannot tell), title, owner, body, tags. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-new-card',
  template: `
    @for (n of [formNumber()]; track n) {
      <baht-form-modal
        [heading]="t('board.newCard')"
        [submitLabel]="t('board.createCard')"
        [open]="open()"
        [form]="form()"
        [value]="value()"
        [registry]="registry"
        [error]="error()"
        (bahtSubmit)="create($event.data)"
        (bahtClose)="closed.emit()"
      ></baht-form-modal>
    }
  `,
})
export class NewCardComponent {
  private readonly api = inject(Api).client.api
  protected readonly t = inject(I18n).t

  readonly open = input(false)
  /** The projects a card can go to. */
  readonly projects = input.required<readonly { id: number; name: string }[]>()
  /** The project on screen; null when the board shows them all. */
  readonly project = input<number | null>(null)
  readonly closed = output()
  /** The new card's number. */
  readonly created = output<number>()

  protected readonly registry = REGISTRY
  protected readonly error = signal('')
  /** A form keeps what was typed into it, so each new card gets a form of its own. */
  protected readonly formNumber = signal(0)
  protected readonly value = signal<Record<string, unknown>>({})

  protected readonly form = computed<FormDefinition>(() => {
    const form = newCardForm(this.t)
    // the board shows one project, or there is only one: the card goes there, nothing to ask
    const known = this.project() !== null || this.projects().length <= 1
    return {
      ...form,
      fields: form.fields
        .filter((f) => !(known && f.key === 'project_id'))
        .map((f) =>
          f.key === 'project_id'
            ? { ...f, options: this.projects().map((p) => ({ key: String(p.id), label: p.name })) }
            : f,
        ),
    }
  })

  constructor() {
    // opened: an empty form, set to the project on screen (else the first)
    effect(() => {
      if (!this.open()) return
      untracked(() => {
        const project = this.project() ?? this.projects()[0]?.id
        this.formNumber.update((n) => n + 1)
        this.value.set({
          project_id: project === undefined ? null : String(project),
          owner: 'autopilot',
          tags: [],
        })
        this.error.set('')
      })
    })
  }

  protected async create(submitted: Record<string, unknown>): Promise<void> {
    // `form` is the new-card form with its project field filled in or left out, so the element
    // cannot say what it holds: this names it once
    const data = submitted as Partial<FormValues<ReturnType<typeof newCardForm>>>
    try {
      const [card] = await firstValueFrom(
        this.api.cards.batch.post({
          cards: [
            newCardBody({
              // no project field when the board knows it: the one the form started with
              project_id: Number(data.project_id ?? this.value()['project_id']),
              title: trimmed(data.title),
              body: data.body ?? '',
              owner: data.owner ?? 'autopilot',
              tags: data.tags ?? [],
            }),
          ],
        }),
      )
      this.closed.emit()
      if (card) this.created.emit(card.id)
    } catch (error) {
      this.error.set(describeError(error))
    }
  }
}
