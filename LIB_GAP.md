# Library gaps

Things the `@20baht/*` libraries lack or get wrong, found while building kammacron. Each entry says
what happened, the workaround in this repo (so it can be removed once the library is fixed), and
what the library could do instead.

## @20baht/ui

### No Kanban board element

- **Seen:** the board (columns, drag between and within them with a position between neighbours, a count per
  column, an empty "drop here" state, an add-card line at a column's foot) is all hand-written CSS and HTML5
  drag events in the app, and keyboard moves are missing.
- **Workaround:** `apps/web/src/app/modules/board/`.
- **Fix in the lib:** a `<baht-board>` (columns, cards as templates, `baht-move { id, column, before }`,
  keyboard move, quick-add slot), the way `<baht-table>` owns a table.

### Dark theme: little contrast between layers (design note)

- **Seen:** in a redesign review the dark theme read as near-black with surfaces, columns and cards too close
  to tell apart (`--baht-color-bg`, `-bg-sunken`, `-surface`).
- **Workaround:** none (the app keeps the family's tokens).
- **Fix in the lib:** worth a look at the dark ramp: a lifted page background and a clearer step to surfaces.
