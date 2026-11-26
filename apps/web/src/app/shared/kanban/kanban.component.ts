import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
  output,
  signal,
  TemplateRef,
} from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import { BAHT_UI } from '@20baht/angular'

import { I18n } from '../../core/i18n/i18n.service'

/** One column of the board; `accent` colours its top edge (a CSS colour, a token). */
export type KanbanColumn = { key: string; label: string; accent?: string }

/** An item on the board: anything with an id. */
export type KanbanItem = { id: number }

/** A move asked for by drag or keyboard: put `id` in `to`, before `before` (null: at the end). */
export type KanbanMove = { id: number; to: string; before: number | null }

/** `<ng-template kanbanTile let-item>`: how one item is drawn inside its tile. */
@Directive({ selector: 'ng-template[kanbanTile]' })
export class KanbanTileDirective {
  readonly template = inject<TemplateRef<{ $implicit: unknown }>>(TemplateRef)
}

/** `<ng-template kanbanFooter let-column>`: what sits under a column's tiles (a quick add). */
@Directive({ selector: 'ng-template[kanbanFooter]' })
export class KanbanFooterDirective {
  readonly template = inject<TemplateRef<{ $implicit: KanbanColumn }>>(TemplateRef)
}

/**
 * A board of columns: drag a tile to another column or before another tile, or move the focused
 * tile with the keyboard (Alt+←/→ to the column beside, Alt+↑/↓ within its column). Enter or a
 * click opens it. The host owns the items and says where they are (`lanes`); this only asks for
 * moves.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BAHT_UI, NgTemplateOutlet],
  selector: 'app-kanban',
  styleUrl: './kanban.component.css',
  templateUrl: './kanban.component.html',
})
export class KanbanComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
  protected readonly t = inject(I18n).t

  readonly columns = input.required<readonly KanbanColumn[]>()
  /** The items of each column, in order. */
  readonly lanes = input.required<Record<string, readonly KanbanItem[]>>()
  readonly selected = input<number | null>(null)
  /** The board's name for assistive tech; the catalog's `kanban.label` when unset. */
  readonly label = input<string>()
  /** What an empty column says; the catalog's `kanban.empty` when unset. */
  readonly emptyText = input<string>()

  readonly move = output<KanbanMove>()
  readonly opened = output<number>()

  protected readonly tile = contentChild(KanbanTileDirective)
  protected readonly footer = contentChild(KanbanFooterDirective)
  private dragged: number | null = null
  /** The tile being dragged and the column under it, so both can show it while the drag lasts. */
  protected readonly dragging = signal<number | null>(null)
  protected readonly over = signal<string | null>(null)

  protected dragStart(event: DragEvent, id: number): void {
    this.dragged = id
    this.dragging.set(id)
    event.dataTransfer?.setData('text/plain', String(id))
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  protected drop(event: DragEvent, to: string, before: number | null): void {
    event.preventDefault()
    event.stopPropagation()
    const id = this.dragged ?? Number(event.dataTransfer?.getData('text/plain'))
    this.dragEnd()
    if (!Number.isInteger(id) || id <= 0 || id === before) return
    this.move.emit({ id, to, before })
  }

  protected dragOver(event: DragEvent, column: string): void {
    event.preventDefault()
    this.over.set(column)
  }

  protected dragEnd(): void {
    this.dragged = null
    this.dragging.set(null)
    this.over.set(null)
  }

  /** Alt+arrows move the focused tile; focus follows it once the host redraws. */
  protected key(event: KeyboardEvent, column: string, id: number): void {
    if (event.key === 'Enter') {
      this.opened.emit(id)
      return
    }
    if (!event.altKey) return
    const keys = this.columns().map((c) => c.key)
    const lane = this.lanes()[column] ?? []
    const at = lane.findIndex((i) => i.id === id)
    let next: KanbanMove | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const to = keys[keys.indexOf(column) + (event.key === 'ArrowLeft' ? -1 : 1)]
      if (to !== undefined) next = { id, to, before: null }
    } else if (event.key === 'ArrowUp' && at > 0) {
      next = { id, to: column, before: lane[at - 1]?.id ?? null }
    } else if (event.key === 'ArrowDown' && at >= 0 && at < lane.length - 1) {
      next = { id, to: column, before: lane[at + 2]?.id ?? null }
    }
    if (!next) return
    event.preventDefault()
    this.move.emit(next)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        this.host.nativeElement.querySelector<HTMLElement>(`[data-item="${String(id)}"]`)?.focus(),
      ),
    )
  }
}
