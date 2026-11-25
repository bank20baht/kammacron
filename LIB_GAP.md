# Library gaps

Things the `@20baht/*` libraries lack or get wrong, found while building kammacron. Each entry says
what happened, the workaround in this repo (so it can be removed once the library is fixed), and
what the library could do instead.

## @20baht/ui

### A navigator link with an icon and no badge puts its label at the far end

- **Seen:** `.baht-shell-link--icon` is `display: flex; justify-content: space-between`, meant to send a
  `badge` to the end. With an `icon` and no badge the two children are the icon and the label, so the label
  is pushed to the right edge of the navigator; only entries with a badge read normally.
- **Workaround:** `apps/web/src/styles.css` gives the label `flex: 1`.
- **Fix in the lib:** let the label grow (`flex: 1`) instead of spreading the row, as the badge-only case
  already does.

### `baht-stat` (and charts) show currency without cents

- **Seen:** `formatValue(value, 'currency')` in `@20baht/dashboard` uses `maximumFractionDigits: 0`, so the
  API-equivalent cost of a run ($0.009) reads `$0`, and a week of small runs reads `$0` too.
- **Workaround:** the Stats page shows cost in a card of its own with `money()` of `@20baht/formats` (cents
  kept), and the cost chart plots whole US cents.
- **Fix in the lib:** a `fraction-digits` (or `precision`) option on `baht-stat` and the charts, or keep two
  decimals when the value is under 100.

### `baht-accordion` panels take text only

- **Seen:** `AccordionItem.content` is a string. A "Technical details" section with a code block and a copy
  button, or an "Advanced options" section holding fields, cannot be built from it.
- **Workaround:** the run page puts plain lines in it.
- **Fix in the lib:** panels as children (`data-panel="…"`), as `baht-tabs` does.

### No Kanban board element

- **Seen:** the board (columns, drag between and within them with a position between neighbours, a count per
  column, an empty "drop here" state, an add-card line at a column's foot) is all hand-written CSS and HTML5
  drag events in the app, and keyboard moves are missing.
- **Workaround:** `apps/web/src/app/modules/board/`.
- **Fix in the lib:** a `<baht-board>` (columns, cards as templates, `baht-move { id, column, before }`,
  keyboard move, quick-add slot), the way `<baht-table>` owns a table.

### `baht-table` cannot leave a column out of `column-search`

- **Seen:** `column-search` puts a search box under every column, including computed ones the server cannot
  search (duration, cost), and makes a narrow table scroll sideways.
- **Workaround:** Runs has one `baht-search` and `baht-filter` chips instead of the search row.
- **Fix in the lib:** `searchable: false` on a `ColumnSpec`.

### Dark theme: little contrast between layers (design note)

- **Seen:** in a redesign review the dark theme read as near-black with surfaces, columns and cards too close
  to tell apart (`--baht-color-bg`, `-bg-sunken`, `-surface`).
- **Workaround:** none (the app keeps the family's tokens).
- **Fix in the lib:** worth a look at the dark ramp: a lifted page background and a clearer step to surfaces.
