import { TestBed } from '@angular/core/testing'

import { instantThemeSwitch } from './theme-switch'

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
const root = document.documentElement

describe('a theme switch', () => {
  beforeEach(() => {
    TestBed.runInInjectionContext(instantThemeSwitch)
  })

  afterEach(() => {
    root.removeAttribute('data-baht-theme')
  })

  it('holds transitions for the frame the new theme is drawn in, then lets them go', async () => {
    root.setAttribute('data-baht-theme', 'dark')
    await Promise.resolve() // the observer hears it before the page is drawn
    expect(root.classList.contains('app-theme-switching')).toBe(true)
    await frame()
    await frame()
    await frame()
    expect(root.classList.contains('app-theme-switching')).toBe(false)
  })
})
