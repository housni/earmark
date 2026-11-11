# Earmark

Obsidian plugin for budget planning and tracking. Data lives in notes as YAML inside fenced code blocks (`budget-catalog`, `budget`), rendered as interactive UIs by code block processors.

## Commands
- `npm run build`: type-check + production build to `main.js`
- `npm run dev`: watch build
- `npm test`: vitest (pure modules only)

## Layout
- `src/model.ts`, `src/money.ts`: pure logic (normalize, ids, block find/replace, totals). No `obsidian` imports, so they stay testable.
- `src/store.ts`: `updateBlock` rewrites one block via `vault.process`, located by `getSectionInfo().lineStart`.
- `src/views/`: `CatalogView`, `BudgetView` (rendered per code block).
- `src/modals/`: forms and pickers.
- Original design: `.claude/plans/initial-plan.md`.

## Conventions
- Mutate rows by `id` (items, transactions, credits), never by index.
- Normalizers spread the raw object first so hand-added YAML keys survive saves; `toPlain` drops empty fields below top level.
- Budget items are snapshots of catalog items (`sourceId` links back); refresh keeps `id` and `transactions`.
- No inline styles or `innerHTML` (community plugin guidelines); use CSS classes/variables in `styles.css`.
- Tabs for indentation, double quotes.
