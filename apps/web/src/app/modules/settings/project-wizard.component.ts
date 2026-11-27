import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  resource,
  signal,
  untracked,
  viewChild,
  type ElementRef,
} from '@angular/core'
import { Router } from '@angular/router'
import { BAHT_UI } from '@20baht/angular'
import type { BahtWorkflow } from '@20baht/ui'
import { Api, describeError } from '@kammacron/kit'
import { firstValueFrom } from 'rxjs'

import { I18n } from '../../core/i18n/i18n.service'
import { REGISTRY } from '../../shared/forms'
import {
  PROJECT_STEPS,
  firstJob,
  folderName,
  projectBody,
  projectWizard,
} from '../../shared/project-wizard'

type Data = Record<string, Record<string, unknown> | undefined>

/**
 * A new project in three steps, in a modal: the folder (its name filled in), what agents may do,
 * and a first cron job. Creates the project, then the job, and opens its board.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI],
  selector: 'web-project-wizard',
  styles: `
    baht-alert {
      display: block;
      margin-bottom: var(--baht-space-3);
    }
  `,
  template: `
    <baht-modal
      size="lg"
      [heading]="t('settings.projects.wizard.heading')"
      [open]="open()"
      (bahtClose)="closed.emit()"
    >
      @if (open()) {
        @if (error(); as message) {
          <baht-alert tone="danger" [message]="message"></baht-alert>
        }
        @if (system.value(); as _) {
          <baht-workflow
            #wf
            show-steps
            [workflow]="definition()"
            [value]="start"
            [registry]="registry"
            [busy]="busy()"
            [submitLabel]="t('settings.projects.wizard.create')"
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
export class ProjectWizardComponent {
  private readonly api = inject(Api).client.api
  private readonly router = inject(Router)
  protected readonly t = inject(I18n).t
  protected readonly registry = REGISTRY

  readonly open = input(false)
  readonly closed = output()

  private readonly workflow = viewChild<ElementRef<BahtWorkflow>>('wf')
  protected readonly busy = signal(false)
  protected readonly error = signal<string | null>(null)
  protected readonly start = {}
  /** The name the folder gave last: a name typed over it is left alone. */
  private autoName = ''
  /** Made already, when its first job failed: a retry adds only the job. */
  private made: { id: number; slug: string } | null = null

  /** The agents this machine has (the worker's PATH). */
  protected readonly system = resource({ loader: () => firstValueFrom(this.api.system.get()) })
  private readonly agent = computed(() => {
    const found = (name: string) =>
      (this.system.value()?.tools ?? []).some((tool) => tool.name === name && tool.path)
    return found('claude') ? 'claude' : found('codex') ? 'codex' : null
  })
  protected readonly definition = computed(() => projectWizard(this.t, this.agent() !== null))

  constructor() {
    effect(() => {
      if (!this.open()) return
      untracked(() => {
        this.error.set(null)
        this.autoName = ''
        this.made = null
      })
    })
  }

  /** The name follows the folder until it is typed over. */
  protected changed(data: Data): void {
    const el = this.workflow()?.nativeElement
    const s = PROJECT_STEPS
    const folder = data[s.folder]
    if (!el || !folder) return
    const str = (v: unknown) => (typeof v === 'string' ? v : '')
    const fromPath = folderName(str(folder['repo_path']))
    const name = str(folder['name'])
    if (fromPath !== this.autoName && (name === '' || name === this.autoName)) {
      this.autoName = fromPath
      el.setValue(s.folder, { name: fromPath })
    }
  }

  protected async submit(data: Data): Promise<void> {
    const { project, first } = projectBody(data)
    this.busy.set(true)
    this.error.set(null)
    try {
      const created = this.made ?? (await firstValueFrom(this.api.projects.post(project)))
      this.made = { id: created.id, slug: created.slug }
      const agent = this.agent()
      if (first && agent)
        await firstValueFrom(
          this.api
            .projects({ id: String(created.id) })
            .schedules.post(firstJob(this.t, first, agent)),
        )
      this.closed.emit()
      void this.router.navigate(['/board', created.slug])
    } catch (error) {
      this.error.set(describeError(error))
    } finally {
      this.busy.set(false)
    }
  }
}
