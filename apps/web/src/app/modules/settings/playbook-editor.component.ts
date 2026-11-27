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
import type { TabItem } from '@20baht/ui'
import type { FormValues } from '@20baht/ui/engine'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { claudeStepForm, playbookNameForm, runStepForm } from '../../shared/forms'
import { countOf, trimmed, type FormOf } from '../../shared/form-data'

// the elements this component's template draws: they arrive with it (see src/elements.ts)
import '@20baht/ui/components/alert'
import '@20baht/ui/components/card'
import '@20baht/ui/components/form'
import '@20baht/ui/components/save-bar'
import '@20baht/ui/components/tabs'

type ClaudeStep = {
  kind: 'claude'
  name: string
  prompt?: string
  model?: string
  max_turns?: number
  allow?: string[]
}
type RunStep = {
  kind: 'run'
  name: string
  command: string
  timeout_minutes?: number
  continue_on_error?: boolean
}
export type PlaybookStep = ClaudeStep | RunStep
export type Playbook = { name: string; steps: PlaybookStep[] }

const DEFAULT = 'default'
const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/

type ClaudeData = FormValues<ReturnType<typeof claudeStepForm>>
type RunData = FormValues<ReturnType<typeof runStepForm>>

/** A step being edited: the form's data as it is, and a key that survives reordering. */
type Row =
  | { key: number; kind: 'claude'; data: Partial<ClaudeData> }
  | { key: number; kind: 'run'; data: Partial<RunData> }

/** A playbook being edited: its name and its steps. */
type Book = { key: number; name: string; rows: Row[] }

/** The form's data back into a step the API takes: empty optional fields left out. */
const toStep = (row: Row): PlaybookStep => {
  if (row.kind === 'run') {
    const d = row.data
    const timeout = countOf(d.timeout_minutes, undefined)
    return {
      kind: 'run',
      name: trimmed(d.name),
      command: trimmed(d.command),
      ...(timeout ? { timeout_minutes: timeout } : {}),
      ...(d.continue_on_error === true ? { continue_on_error: true } : {}),
    }
  }
  const d = row.data
  const turns = countOf(d.max_turns, undefined)
  const prompt = trimmed(d.prompt)
  const model = trimmed(d.model)
  const allow = (d.allow ?? []).filter(Boolean)
  return {
    kind: 'claude',
    name: trimmed(d.name),
    ...(prompt ? { prompt } : {}),
    ...(model ? { model } : {}),
    ...(turns ? { max_turns: turns } : {}),
    ...(allow.length ? { allow } : {}),
  }
}

/**
 * The project's playbooks: `default`, and others a card picks with the tag `playbook:<name>`.
 * Each is its steps in order, each a small form, with templates to add a Claude step, a command,
 * or a command over SSH. Saved together, apart from the project's form.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-playbook-editor',
  styles: `
    .step {
      margin-block: var(--baht-space-3);
      padding: var(--baht-space-3) var(--baht-space-4);
      border: 1px solid var(--baht-color-border);
      border-radius: var(--baht-radius-lg);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2);
      margin-block-end: var(--baht-space-2);
    }
    .grow {
      flex: 1;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--baht-space-2);
      margin-block: var(--baht-space-3);
    }
    .muted {
      color: var(--baht-color-text-muted);
    }
  `,
  template: `
    <baht-card
      [heading]="t('project.playbook.heading')"
      [subtitle]="t('project.playbook.subtitle')"
    >
      <baht-tabs
        [tabs]="tabs()"
        [value]="String(currentKey())"
        (bahtChange)="pick($event.value)"
      ></baht-tabs>
      <div class="row">
        @if (book(); as b) {
          @if (b.name === 'default') {
            <span class="muted">{{ t('project.playbook.defaultHelp') }}</span>
          } @else {
            <span class="muted">{{
              t('project.playbook.tagHelp', { tag: 'playbook:' + b.name })
            }}</span>
            <span class="grow"></span>
            <baht-button size="sm" variant="ghost" icon="trash" (click)="removeBook()">{{
              t('project.playbook.removeBook')
            }}</baht-button>
          }
        }
      </div>
      @for (row of rows(); track row.key; let i = $index, first = $first, last = $last) {
        <div class="step">
          <div class="head">
            <baht-badge
              [tone]="row.kind === 'claude' ? 'info' : 'neutral'"
              [label]="
                t('project.playbook.step', { n: i + 1 }) +
                ' · ' +
                (row.kind === 'claude' ? t('project.playbook.claude') : t('project.playbook.run'))
              "
            ></baht-badge>
            <span class="grow"></span>
            <baht-button
              size="sm"
              variant="ghost"
              icon="chevron-up"
              icon-only
              [label]="t('project.playbook.up')"
              [disabled]="first"
              (click)="move(i, -1)"
            ></baht-button>
            <baht-button
              size="sm"
              variant="ghost"
              icon="chevron-down"
              icon-only
              [label]="t('project.playbook.down')"
              [disabled]="last"
              (click)="move(i, 1)"
            ></baht-button>
            <baht-button
              size="sm"
              variant="ghost"
              icon="trash"
              icon-only
              [label]="t('project.playbook.remove')"
              (click)="remove(i)"
            ></baht-button>
          </div>
          <baht-form
            [form]="row.kind === 'claude' ? claudeForm() : runForm()"
            [value]="row.data"
            (bahtChange)="change(row.key, $event.data)"
          ></baht-form>
        </div>
      } @empty {
        <p class="muted">{{ t('project.playbook.empty') }}</p>
      }
      <div class="row">
        <span class="muted">{{ t('project.playbook.add') }}</span>
        <baht-button size="sm" variant="secondary" icon="plus" (click)="addClaude()">{{
          t('project.playbook.addClaude')
        }}</baht-button>
        <baht-button size="sm" variant="secondary" icon="plus" (click)="addRun()">{{
          t('project.playbook.addRun')
        }}</baht-button>
        <baht-button size="sm" variant="secondary" icon="plus" (click)="addSsh()">{{
          t('project.playbook.addSsh')
        }}</baht-button>
      </div>
      <p class="muted">{{ t('project.playbook.env') }}</p>
      <div class="row">
        <baht-form #nf="bahtForm" class="grow" [form]="nameForm()" [value]="{}"></baht-form>
        <baht-button size="sm" variant="secondary" icon="plus" (click)="addBook(nf)">{{
          t('project.playbook.addBook')
        }}</baht-button>
      </div>
      @if (error(); as e) {
        <baht-alert
          tone="danger"
          [message]="e"
          dismissible
          (bahtDismiss)="error.set(null)"
        ></baht-alert>
      }
    </baht-card>
    <baht-save-bar
      [open]="dirty()"
      [message]="t('project.playbook.unsaved')"
      warn-on-leave
      [loading]="busy()"
      (bahtSave)="save()"
      (bahtDiscard)="reset()"
    ></baht-save-bar>
  `,
})
export class PlaybookEditorComponent {
  private readonly api = inject(Api).client.api
  protected readonly t = inject(I18n).t
  readonly projectId = input.required<string>()
  readonly playbooks = input.required<readonly Playbook[]>()
  readonly saved = output()

  protected readonly claudeForm = computed(() => claudeStepForm(this.t))
  protected readonly runForm = computed(() => runStepForm(this.t))
  protected readonly nameForm = computed(() => playbookNameForm(this.t))
  protected readonly String = String
  protected readonly books = signal<Book[]>([])
  protected readonly currentKey = signal(0)
  protected readonly book = computed(
    () => this.books().find((b) => b.key === this.currentKey()) ?? this.books()[0],
  )
  protected readonly rows = computed(() => this.book()?.rows ?? [])
  protected readonly tabs = computed<TabItem[]>(() =>
    this.books().map((b) => ({ key: String(b.key), label: b.name, badge: String(b.rows.length) })),
  )
  /** Unsaved changes: read by the settings page before its tab or the page goes. */
  readonly dirty = signal(false)
  protected readonly busy = signal(false)
  protected readonly error = signal<string | null>(null)
  private nextKey = 0

  constructor() {
    effect(() => {
      const playbooks = this.playbooks()
      // The project row answers again for many reasons (a round ran, Resume, another tab): the
      // same playbooks are not loaded twice, and a draft is not replaced under the person.
      untracked(() => {
        if (JSON.stringify(playbooks) === this.loaded || this.dirty()) return
        this.load(playbooks)
      })
    })
  }

  /** The playbooks the editor last took in, as JSON. */
  private loaded: string | null = null

  private load(playbooks: readonly Playbook[]): void {
    this.loaded = JSON.stringify(playbooks)
    const books = playbooks.map((p) => ({
      key: this.nextKey++,
      name: p.name,
      rows: p.steps.map((step) => this.row(step)),
    }))
    this.books.set(books)
    this.currentKey.set(books.find((b) => b.name === DEFAULT)?.key ?? books[0]?.key ?? 0)
    this.dirty.set(false)
  }

  private row(step: PlaybookStep): Row {
    const { kind, ...data } = step
    return { key: this.nextKey++, kind, data }
  }

  private edit(next: (rows: Row[]) => Row[]): void {
    const key = this.book()?.key
    this.books.update((books) =>
      books.map((b) => (b.key === key ? { ...b, rows: next(b.rows) } : b)),
    )
    this.dirty.set(true)
  }

  protected pick(value: unknown): void {
    this.currentKey.set(Number(value))
  }

  protected addBook(form: FormOf<typeof playbookNameForm>): void {
    const name = trimmed(form.getData().name).toLowerCase()
    if (!NAME.test(name)) {
      this.error.set(this.t('project.playbook.badName'))
      return
    }
    if (this.books().some((b) => b.name === name)) {
      this.error.set(this.t('project.playbook.nameTaken', { name }))
      return
    }
    const book: Book = { key: this.nextKey++, name, rows: [] }
    this.books.update((books) => [...books, book])
    this.currentKey.set(book.key)
    this.dirty.set(true)
    this.error.set(null)
    form.element.reset()
  }

  protected removeBook(): void {
    const key = this.book()?.key
    this.books.update((books) => books.filter((b) => b.key !== key || b.name === DEFAULT))
    this.currentKey.set(this.books()[0]?.key ?? 0)
    this.dirty.set(true)
  }

  protected change(key: number, data: ClaudeData | RunData): void {
    // the row's own form sent this, so the data is of the row's kind
    this.edit((rows) => rows.map((r) => (r.key === key ? { ...r, data } : r)))
  }

  protected move(index: number, by: -1 | 1): void {
    this.edit((rows) => {
      const next = [...rows]
      const [row] = next.splice(index, 1)
      if (row) next.splice(index + by, 0, row)
      return next
    })
  }

  protected remove(index: number): void {
    this.edit((rows) => rows.filter((_, i) => i !== index))
  }

  private add(step: PlaybookStep): void {
    this.edit((rows) => [...rows, this.row(step)])
  }

  protected addClaude(): void {
    this.add({ kind: 'claude', name: this.t('project.playbook.claude') })
  }

  protected addRun(): void {
    this.add({
      kind: 'run',
      name: this.t('project.playbook.runName'),
      command: this.t('project.playbook.runCommand'),
    })
  }

  protected addSsh(): void {
    this.add({
      kind: 'run',
      name: this.t('project.playbook.sshName'),
      command: this.t('project.playbook.sshCommand'),
      timeout_minutes: 10,
    })
  }

  protected reset(): void {
    this.load(this.playbooks())
  }

  protected async save(): Promise<void> {
    const playbooks = this.books().map((b) => ({ name: b.name, steps: b.rows.map(toStep) }))
    const empty = playbooks.find((p) => p.steps.length === 0)
    if (empty) {
      this.currentKey.set(this.books().find((b) => b.name === empty.name)?.key ?? 0)
      this.error.set(this.t('project.playbook.empty'))
      return
    }
    this.busy.set(true)
    this.error.set(null)
    try {
      await firstValueFrom(this.api.projects({ id: this.projectId() }).patch({ playbooks }))
      // what was saved is what the editor holds: the project answering with it changes nothing here
      this.loaded = JSON.stringify(playbooks)
      this.dirty.set(false)
      this.saved.emit()
    } catch (error) {
      this.error.set(describeError(error))
    } finally {
      this.busy.set(false)
    }
  }
}
