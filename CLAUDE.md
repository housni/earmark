# Earmark

Obsidian plugin for budget planning and tracking. Data lives in notes as YAML inside fenced code blocks (`budget-catalog`, `budget`), rendered as interactive UIs by code block processors.

## Commands
- `npm run build`: type-check + production build to `main.js`
- `npm run dev`: watch build
- `npm test`: vitest (pure modules only)
- Release: `npm version patch|minor|major && git push --follow-tags`. `version-bump.mjs` syncs `manifest.json` and `versions.json`, and pushing the tag runs `.github/workflows/release.yml`. Never edit versions by hand.
- Manual test walkthrough in Obsidian: `TESTING.md`. Keep its steps, button names and expected numbers in sync when UI or totals change.

## Layout
- `src/model.ts`, `src/money.ts`: pure logic (normalize, ids, block find/replace, totals). No `obsidian` imports, so they stay testable.
- `src/config.ts`: settings shape, defaults and `migrateSettings` (pure, tested). Bump `SETTINGS_VERSION` and add a step there when saved settings need a one-time change. `src/settings.ts` is only the settings tab.
- `src/dates.ts`: `formatDate` wraps Obsidian's `moment` (cast, because TS 7 rejects its declared type).
- `src/store.ts`: `updateBlock` rewrites one block via `vault.process`, located by `getSectionInfo().lineStart`.
- `src/views/`: `CatalogView`, `BudgetView` (rendered per code block).
- `src/modals/`: forms and pickers.
- Original design: `.claude/plans/initial-plan.md`.

## Conventions
- Mutate rows by `id` (items, transactions, credits), never by index.
- Items carry `created`/`modified` ISO timestamps. Any change to an item sets `modified` (`saveItem` in BudgetView does it for budget items; snapshots get their own dates; refresh keeps `created`). Sorting lives in `sortItems` in `model.ts` (blanks last).
- Normalizers spread the raw object first so hand-added YAML keys survive saves; `toPlain` drops empty fields below top level.
- Budget items are snapshots of catalog items (`sourceId` links back); refresh keeps `id` and `transactions`.
- No inline styles or `innerHTML` (community plugin guidelines); use CSS classes/variables in `styles.css`.
- Tabs for indentation, double quotes.
