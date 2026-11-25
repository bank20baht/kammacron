import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { claudeStepForm, runStepForm } from '../../shared/forms'

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

/** A step being edited: the form's data as it is, and a key that survives reordering. */
type Row = { key: number; kind: 'claude' | 'run'; data: Record<string, unknown> }

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const positive = (v: unknown) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** The form's data back into a step the API takes: empty optional fields left out. */
const toStep = (row: Row): PlaybookStep => {
  const d = row.data
  if (row.kind === 'run') {
    const timeout = positive(d['timeout_minutes'])
    return {
      kind: 'run',
      name: text(d['name']),
      command: text(d['command']),
      ...(timeout ? { timeout_minutes: timeout } : {}),
      ...(d['continue_on_error'] === true ? { continue_on_error: true } : {}),
    }
  }
  const turns = positive(d['max_turns'])
  const allow = Array.isArray(d['allow']) ? (d['allow'] as string[]).filter(Boolean) : []
  return {
    kind: 'claude',
    name: text(d['name']),
    ...(text(d['prompt']) ? { prompt: text(d['prompt']) } : {}),
    ...(text(d['model']) ? { model: text(d['model']) } : {}),
    ...(turns ? { max_turns: turns } : {}),
    ...(allow.length ? { allow } : {}),
  }
}

/**
 * The project's playbook: its steps in order, each a small form, with templates to add a Claude
 * step, a command, or a command over SSH. Saved on its own, apart from the project's form.
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
    .head .grow {
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
            (bahtChange)="change(row.key, $any($event).data)"
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
  readonly playbook = input.required<readonly PlaybookStep[]>()
  readonly saved = output()

  protected readonly claudeForm = computed(() => claudeStepForm(this.t))
  protected readonly runForm = computed(() => runStepForm(this.t))
  protected readonly rows = signal<Row[]>([])
  protected readonly dirty = signal(false)
  protected readonly busy = signal(false)
  protected readonly error = signal<string | null>(null)
  private nextKey = 0

  constructor() {
    effect(() => {
      this.load(this.playbook())
    })
  }

  private load(steps: readonly PlaybookStep[]): void {
    this.rows.set(steps.map((step) => this.row(step)))
    this.dirty.set(false)
  }

  private row(step: PlaybookStep): Row {
    const { kind, ...data } = step
    return { key: this.nextKey++, kind, data }
  }

  private edit(next: (rows: Row[]) => Row[]): void {
    this.rows.update(next)
    this.dirty.set(true)
  }

  protected change(key: number, data: Record<string, unknown>): void {
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
    this.load(this.playbook())
  }

  protected async save(): Promise<void> {
    const steps = this.rows().map(toStep)
    if (steps.length === 0) {
      this.error.set(this.t('project.playbook.empty'))
      return
    }
    this.busy.set(true)
    this.error.set(null)
    try {
      await firstValueFrom(this.api.projects({ id: this.projectId() }).patch({ playbook: steps }))
      this.dirty.set(false)
      this.saved.emit()
    } catch (error) {
      this.error.set(describeError(error))
    } finally {
      this.busy.set(false)
    }
  }
}
