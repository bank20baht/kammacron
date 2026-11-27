import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BUILT_IN_TYPES } from '@20baht/ui/engine'

/*
 * `elements.ts` registers only the <baht-*> elements the app uses. A tag missing from it is an
 * empty unknown element on the page, with no build error, so this keeps the list whole.
 */
const src = join(process.cwd(), 'src')
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts') ? [path] : []
  })
const code = files(join(src, 'app')).map((f) => readFileSync(f, 'utf8'))
const registered = new Set(
  [
    ...readFileSync(join(src, 'elements.ts'), 'utf8').matchAll(
      /@20baht\/ui\/components\/([a-z-]+)/g,
    ),
  ].map((m) => `baht-${m[1] ?? ''}`),
)
/** Tags `<baht-form>` registers for its fields; the rest of a field's tag must be listed. */
const FORM_OWN =
  /^baht-(checkbox|currency|datepicker|file|input|markdown|multiselect|number|radio|range|rating|reference-picker|repeater|section|select|tabs|tags|text|textarea|toggle)$/
/** Stickers come from @20baht/stickers, registered by `shared/stickers.ts`. */
const ELSEWHERE = new Set(['baht-sticker'])

describe('elements.ts', () => {
  it('registers every <baht-*> tag a template uses', () => {
    const used = new Set(
      code.flatMap((c) => [...c.matchAll(/<(baht-[a-z-]+)/g)].map((m) => m[1] ?? '')),
    )
    const missing = [...used].filter((tag) => !registered.has(tag) && !ELSEWHERE.has(tag))
    expect(missing).toEqual([])
  })

  it('registers the element of every field type a form uses', () => {
    const types = new Set(
      code.flatMap((c) => [...c.matchAll(/type: '([a-z-]+)'/g)].map((m) => m[1] ?? '')),
    )
    const tags = [...types].flatMap((type) => {
      const tag = (BUILT_IN_TYPES as Record<string, { tag?: string } | undefined>)[type]?.tag
      return tag ? [tag] : []
    })
    const missing = tags.filter((tag) => !FORM_OWN.test(tag) && !registered.has(tag))
    expect(missing).toEqual([])
  })
})
