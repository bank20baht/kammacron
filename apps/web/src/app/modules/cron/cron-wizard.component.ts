import type { ElementRef } from '@angular/core'
import {
  ChangeDetectionStrategy,
  Component,
  afterRenderEffect,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core'
import { BAHT_UI } from '@20baht/angular'
import type { BahtWorkflow } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { cronJobBody, cronStart, cronSteps, cronWizard } from '../../shared/cron-wizard'
import { REGISTRY, type AgentOptions } from '../../shared/forms'

type Project = { id: number; name: string; playbooks: readonly { name: string }[] }
type Data = Record<string, Record<string, unknown> | undefined>

/**
 * A new cron job in three steps, in a modal: what (the project, its name, who does it), the task,
 * and when. The board's New ▾, the Cron jobs page and a project's settings open it; `project` set
 * means the job's project is known and not asked.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-cron-wizard',
  styles: `
    baht-alert {
      display: block;
      margin-bottom: var(--baht-space-3);
    }
  `,
  template: `
    <baht-modal
      size="lg"
      [heading]="t('cron.wizard.heading')"
      [open]="open()"
      (bahtClose)="closed.emit()"
    >
      @if (open()) {
        @if (error(); as message) {
          <baht-alert tone="danger" [message]="message"></baht-alert>
        }
        @if (definition(); as def) {
          <baht-workflow
            #wf
            show-steps
            submit-on-enter
            [workflow]="def"
            [value]="start()"
            [registry]="registry"
            [busy]="busy()"
            [submitLabel]="t('cron.add')"
            (bahtDataChange)="changed($any($event).data)"
            (bahtSubmit)="submit($any($event).data)"
          ></baht-workflow>
        } @else {
          <baht-skeleton variant="text"></baht-skeleton>
        }
      }
    </baht-modal>
  `,
})
export class CronWizardComponent {
  private readonly api = inject(Api).client.api
  protected readonly t = inject(I18n).t
  protected readonly registry = REGISTRY

  readonly open = input(false)
  /** The projects a job may go to. */
  readonly projects = input<readonly Project[]>([])
  /** The project to start with; with `fixed`, the only one, and not asked. */
  readonly project = input<string | null>(null)
  readonly fixed = input(false, { transform: booleanAttribute })
  readonly closed = output()
  /** A job was added: its name and project. */
  readonly added = output<{ name: string; project: string }>()

  private readonly workflow = viewChild<ElementRef<BahtWorkflow>>('wf')
  protected readonly busy = signal(false)
  protected readonly error = signal<string | null>(null)
  /** The project whose agents and models the steps offer. */
  private readonly chosen = signal<string | null>(null)
  /** What the chosen project's machine can run; null while it is read. */
  private readonly options = signal<AgentOptions | null>(null)
  private readonly loaded = signal(false)
  /** The run so far, put back once the steps are rebuilt for another project. */
  private pending: unknown = null

  private readonly steps = computed(() => cronSteps(this.t))
  protected readonly definition = computed(
    () => {
      if (!this.loaded()) return null
      const id = this.chosen()
      const list = this.projects()
      return cronWizard(this.t, {
        projects: this.fixed() ? null : list,
        options: this.options(),
        playbooks: (list.find((p) => String(p.id) === id)?.playbooks ?? []).map((p) => p.name),
      })
      // a live list sends new arrays of the same projects: a new definition would start the run over
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  )
  /** Where a run starts: given once when the modal opens, not on each change. */
  protected readonly start = signal<Record<string, Record<string, unknown>>>({})

  constructor() {
    // each opening starts over, on the project it was opened for
    effect(() => {
      if (!this.open()) return
      const id = untracked(() => this.project() ?? String(this.projects()[0]?.id ?? '')) || null
      untracked(() => {
        this.error.set(null)
        this.pending = null
        this.loaded.set(false)
        void this.load(id, true)
      })
    })
    // the steps rebuilt for another project: the run goes on where it was
    afterRenderEffect(() => {
      this.definition()
      const el = this.workflow()?.nativeElement
      if (!el || this.pending === null) return
      el.restore(this.pending)
      this.pending = null
    })
  }

  /** Reads what the project can run; `fresh`: a new run begins on it. */
  private async load(id: string | null, fresh: boolean): Promise<void> {
    this.chosen.set(id)
    let options: AgentOptions = { claude: null, codex: null }
    if (id)
      try {
        options = await firstValueFrom(this.api.projects({ id }).agents.get())
      } catch {
        // no list: Claude and Codex are left out, a command or a playbook still go
      }
    if (this.chosen() !== id) return
    this.options.set(options)
    if (fresh) this.start.set(cronStart(this.t, options, id))
    this.loaded.set(true)
  }

  /** Another project picked: its agents and models, the run kept. */
  protected changed(data: Data): void {
    const el = this.workflow()?.nativeElement
    if (!el) return
    const s = this.steps()
    const what = data[s.what] ?? {}

    const project = typeof what['project_id'] === 'string' ? what['project_id'] : null
    if (!this.fixed() && project && project !== this.chosen()) {
      this.pending = el.getState()
      void this.load(project, false)
    }
  }

  protected async submit(data: Data): Promise<void> {
    // no project field (one project, or a fixed one): the project the steps were read for
    const { project, body } = cronJobBody(this.t, data, this.fixed() ? this.project() : null)
    const target = project ?? this.chosen()
    if (!target) {
      this.error.set(this.t('cron.noProjectHelp'))
      return
    }
    this.busy.set(true)
    this.error.set(null)
    try {
      await firstValueFrom(this.api.projects({ id: target }).schedules.post(body))
      this.added.emit({ name: body.name, project: target })
      this.closed.emit()
    } catch (error) {
      this.error.set(describeError(error))
    } finally {
      this.busy.set(false)
    }
  }
}
