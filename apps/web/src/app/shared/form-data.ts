import type { BahtForm } from '@20baht/ui'
import type { FormDefinition, FormValues } from '@20baht/ui/engine'

/**
 * A form's data, typed by the form it was drawn from: `title` is `string | null`, `tags` is
 * `string[]`, a radio's value is one of its keys. The element hands its data back untyped
 * (`Record<string, unknown>`); this is the one place that says which form it holds, so pass the
 * same form the template binds to `[form]`.
 */
export const dataOf = <F extends FormDefinition>(_form: F, element: BahtForm): FormValues<F> =>
  element.getData() as FormValues<F>

/** A text field's value without the space around it; empty when nothing was typed. */
export const trimmed = (value: string | null | undefined): string => value?.trim() ?? ''

/** The same, as the API takes an optional text: `null` when nothing was typed. */
export const filled = (value: string | null | undefined): string | null => trimmed(value) || null

/** A number field as a count: a whole number above zero, else the fallback. */
export const countOf = <T>(value: number | null | undefined, fallback: T): number | T => {
  const n = Math.round(value ?? Number.NaN)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
