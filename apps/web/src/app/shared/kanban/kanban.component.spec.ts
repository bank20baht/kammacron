import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import {
  KanbanComponent,
  KanbanTileDirective,
  type KanbanColumn,
  type KanbanItem,
  type KanbanMove,
} from './kanban.component'

type Item = KanbanItem & { title: string }

@Component({
  imports: [KanbanComponent, KanbanTileDirective],
  template: `
    <app-kanban
      [columns]="columns"
      [lanes]="lanes()"
      (move)="moves.push($event)"
      (opened)="opened.push($event)"
    >
      <ng-template kanbanTile let-item>{{ item.title }}</ng-template>
    </app-kanban>
  `,
})
class Host {
  readonly columns: KanbanColumn[] = [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
  ]
  readonly lanes = signal<Record<string, Item[]>>({
    a: [
      { id: 1, title: 'one' },
      { id: 2, title: 'two' },
      { id: 3, title: 'three' },
    ],
    b: [],
  })
  readonly moves: KanbanMove[] = []
  readonly opened: number[] = []
}

const press = (el: Element, key: string, altKey = true) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, altKey, bubbles: true }))

describe('KanbanComponent', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(Host)
    fixture.detectChanges()
    await fixture.whenStable()
    const root = fixture.nativeElement as HTMLElement
    const tile = (id: number): HTMLElement => {
      const el = root.querySelector<HTMLElement>(`[data-item="${String(id)}"]`)
      if (!el) throw new Error(`no tile ${String(id)}`)
      return el
    }
    return { fixture, host: fixture.componentInstance, tile }
  }

  it('draws each lane with the host’s tile, and an empty column’s text', async () => {
    const { fixture } = await setup()
    const text = (fixture.nativeElement as HTMLElement).textContent
    expect(text).toContain('one')
    expect(text).toContain('Drop a card here')
  })

  it('Alt+arrows ask for moves; Enter and a click open', async () => {
    const { host, tile } = await setup()
    press(tile(1), 'ArrowRight')
    press(tile(2), 'ArrowUp')
    press(tile(2), 'ArrowDown')
    press(tile(1), 'ArrowLeft')
    press(tile(3), 'ArrowDown')
    press(tile(1), 'ArrowRight', false)
    expect(host.moves).toEqual([
      { id: 1, to: 'b', before: null },
      { id: 2, to: 'a', before: 1 },
      { id: 2, to: 'a', before: null },
    ])
    press(tile(3), 'Enter', false)
    tile(2).click()
    expect(host.opened).toEqual([3, 2])
  })
})
