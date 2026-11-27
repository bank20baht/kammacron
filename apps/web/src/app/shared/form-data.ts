import type { BahtFormDirective } from '@20baht/angular'
import type { FormDefinition } from '@20baht/ui/engine'

/**
 * A `<baht-form>` as a template hands it over (`#f="bahtForm"`, then `save(f)`), typed by the form
 * it draws: `f.getData().title` is `string | null`. `F` is the function in `shared/forms.ts`.
 */
export type FormOf<F extends (...args: never[]) => FormDefinition> = BahtFormDirective<
  ReturnType<F>
>

/** A text field's value without the space around it; empty when nothing was typed. */
export const trimmed = (value: string | null | undefined): string => value?.trim() ?? ''

/** The same, as the API takes an optional text: `null` when nothing was typed. */
export const filled = (value: string | null | undefined): string | null => trimmed(value) || null

/** A number field as a count: a whole number above zero, else the fallback. */
export const countOf = <T>(value: number | null | undefined, fallback: T): number | T => {
  const n = Math.round(value ?? Number.NaN)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
