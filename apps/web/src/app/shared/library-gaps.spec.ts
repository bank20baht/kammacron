import '@20baht/ui/components/card'
import '@20baht/ui/components/app-shell'
import '@20baht/ui/components/button'

import { Component, signal } from '@angular/core'
import { TestBed, type ComponentFixture } from '@angular/core/testing'
import { BAHT_UI } from '@20baht/angular'
import type { BahtAppShell, BahtCard } from '@20baht/ui'

@Component({
  imports: [BAHT_UI],
  template: `
    <baht-card heading="Schedules">
      @for (schedule of schedules(); track schedule) {
        <p class="schedule">{{ schedule }}</p>
      }
      <baht-button class="add">Add schedule</baht-button>
      @if (editing() === 'first') {
        <section class="editor">first</section>
      } @else {
        <section class="editor">second</section>
      }
    </baht-card>
    <baht-app-shell brand="kammacron" brand-href="/board">
      <img data-slot="brand-art" src="/brand/app-mark.webp" alt="" />
      <main>Workspace</main>
    </baht-app-shell>
  `,
})
class LibraryHost {
  readonly schedules = signal(['daily'])
  readonly editing = signal<'first' | 'second'>('first')
}

/** Flush Angular, Lit, and the library's child-projection observer. */
const settle = async (fixture: ComponentFixture<LibraryHost>) => {
  const root = fixture.nativeElement as HTMLElement
  for (let pass = 0; pass < 3; pass++) {
    fixture.detectChanges()
    await fixture.whenStable()
    await Promise.all([
      root.querySelector<BahtCard>('baht-card')?.updateComplete,
      root.querySelector<BahtAppShell>('baht-app-shell')?.updateComplete,
    ])
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return root
}

const contentOrder = (root: HTMLElement) =>
  Array.from(root.querySelector('.baht-card-body')?.children ?? [], (element) =>
    element.textContent.trim(),
  )

describe('published @20baht/ui library gap fixes', () => {
  it('switches direct Angular blocks and keeps added, reordered and removed rows before the form', async () => {
    const fixture = TestBed.createComponent(LibraryHost)
    const root = await settle(fixture)
    expect(contentOrder(root)).toEqual(['daily', 'Add schedule', 'first'])

    fixture.componentInstance.editing.set('second')
    fixture.componentInstance.schedules.set(['daily', 'weekly'])
    await settle(fixture)
    expect(contentOrder(root)).toEqual(['daily', 'weekly', 'Add schedule', 'second'])

    fixture.componentInstance.schedules.set(['weekly', 'hourly', 'daily'])
    fixture.componentInstance.editing.set('first')
    await settle(fixture)
    expect(contentOrder(root)).toEqual(['weekly', 'hourly', 'daily', 'Add schedule', 'first'])

    fixture.componentInstance.schedules.set([])
    await settle(fixture)
    expect(contentOrder(root)).toEqual(['Add schedule', 'first'])
    fixture.destroy()
  })

  it('projects brand artwork into the existing link and preserves its name and cancelable navigation', async () => {
    const fixture = TestBed.createComponent(LibraryHost)
    const root = await settle(fixture)
    const shell = root.querySelector<BahtAppShell>('baht-app-shell')
    const link = shell?.querySelector<HTMLAnchorElement>('a[href="/board"]')
    const image = link?.querySelector('img[data-slot="brand-art"]')
    expect(image?.getAttribute('alt')).toBe('')
    expect(link?.textContent).toContain('kammacron')
    let destination: string | undefined
    shell?.addEventListener('baht-navigate', (event) => {
      destination = (event as CustomEvent<{ href: string }>).detail.href
      event.preventDefault()
    })
    link?.click()
    expect(destination).toBe('/board')
    fixture.destroy()
  })
})
