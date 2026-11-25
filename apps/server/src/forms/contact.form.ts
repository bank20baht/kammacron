import { defineForm, defineTable, type TableRow, type ValidValues } from '@20baht/engine'

/**
 * One form, as JSON-shaped data: the web app renders it with `<baht-form>` and `POST /api/contact`
 * validates a submission against it with the same rules. Add a field here and both sides have it:
 * `defineForm` keeps the keys and field types, so the data is typed from this declaration too.
 */
export const contactForm = defineForm({
  form_id: 'contact',
  form_name: 'Contact',
  fields: [
    {
      order: 1,
      type: 'text',
      key: 'name',
      label: 'Name',
      validators: [{ type: 'required' }],
    },
    {
      order: 2,
      type: 'email',
      key: 'email',
      label: 'Email',
      validators: [{ type: 'required' }],
    },
    {
      order: 3,
      type: 'textarea',
      key: 'message',
      label: 'Message',
      max_length: 500,
      validators: [{ type: 'required' }],
    },
  ],
})

/** What a submission that passed validation holds: `{ name: string; email: string; message: string }`. */
export type ContactMessage = ValidValues<typeof contactForm>

/**
 * The list of the messages received, declared from the same form: a field's label is the column's
 * header and its type how the column filters. `received_at` is a column the form does not have.
 */
export const contactTable = defineTable(contactForm, {
  pick: ['received_at', 'name', 'email', 'message'],
  extra: { received_at: { label: 'Received', type: 'date', sortable: true } },
})

/** One row of that list. */
export type ContactRow = TableRow<typeof contactTable>
