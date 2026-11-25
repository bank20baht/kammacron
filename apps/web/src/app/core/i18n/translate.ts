/** A message that changes with a count: `Intl.PluralRules` picks the form (`one`, `other`…). */
type Plural = { readonly one?: string; readonly other: string } & Readonly<
  Partial<Record<'zero' | 'two' | 'few' | 'many', string>>
>

type Leaf = string | Plural

/** What a message is filled with: `{name}` in the text takes `params.name`. */
export type Params = Readonly<Record<string, string | number>>

const isPlural = (value: unknown): value is Plural =>
  typeof value === 'object' && value !== null && typeof (value as Plural).other === 'string'

/** Every dotted key of a catalog that ends at a message: `'board.title'`. */
export type KeysOf<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Leaf ? `${P}${K}` : KeysOf<T[K], `${P}${K}.`>
}[keyof T & string]

/** A catalog of the same shape as `T`, with any text: what every other language must be. */
export type ShapeOf<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Plural
      ? Plural
      : ShapeOf<T[K]>
}

const fill = (text: string, params: Params | undefined) =>
  params ? text.replace(/\{(\w+)\}/g, (all, name: string) => String(params[name] ?? all)) : text

/**
 * The message at `key`, filled with `params`. A plural message needs `params.count`. A key the
 * catalog lacks comes back as itself, so a gap shows on the page instead of breaking it.
 */
export const translate = (
  catalog: object,
  locale: string,
  key: string,
  params?: Params,
): string => {
  let node: unknown = catalog
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part]
  if (typeof node === 'string') return fill(node, params)
  if (isPlural(node)) {
    const count = Number(params?.['count'] ?? 0)
    const form = new Intl.PluralRules(locale).select(count)
    return fill(node[form] ?? node.other, params)
  }
  return key
}
