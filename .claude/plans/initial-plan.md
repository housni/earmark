# Obsidian Budget Plugin: Plan

## Context
You want to plan and track budgets in Obsidian. The plugin has three parts:
- A reusable **catalog** of budget items (rent, vet, visa fees…).
- **Budgets** made by picking items from the catalog.
- **Tracking** inside each budget: spending, credit sources, and totals (total cost, spent, still to spend).

There's no existing code to reuse, so this is a new plugin built with the official Obsidian sample-plugin toolchain (TypeScript + esbuild).

What you chose:
- Data is stored as **notes in the vault**.
- A budget keeps a **snapshot** of each item it takes from the catalog.
- Spending is a **transaction log**.
- Amounts can be in **more than one currency**.

## Location
`/home/housni/Projects/github/housni/earmark/`. During development, symlink it into `<vault>/.obsidian/plugins/earmark/`.

## Data model (YAML inside fenced code blocks, read and written with Obsidian's `parseYaml` / `stringifyYaml`)

**Catalog note** (e.g. `Budgets/_Catalog.md`):
````
```budget-catalog
items:
  - id: k3f9
    name: Rent
    amount: 100000
    currency: LKR
    frequency: Monthly
    account: Common
    category: Housing
    priority: High
    tags: [fixed]
    description: Apartment rent
    manager: Housni
```
````

**Budget note** (e.g. `Budgets/2026-11 November.md`):
````
```budget
title: November 2026
baseCurrency: LKR
rates: { USD: 300 }          # 1 USD = 300 LKR, used to convert totals
items:
  - id: b81c
    sourceId: k3f9           # catalog id, used by "refresh from catalog"
    name: Rent               # ...the rest of the snapshotted fields
    amount: 100000           # allocated (can be changed in this budget only)
    currency: LKR
    transactions:
      - { date: 2026-11-03, amount: 100000, note: paid }
credits:
  - { id: c1, source: Bank account, amount: 250000, currency: LKR, note: "" }
  - { id: c2, source: Tax rebate, amount: 400, currency: USD }
```
````

**Settings** (plugin `data.json`; these hold configuration only, never budget data). Each is an editable list:
- frequencies (default: One-time, Weekly, Monthly, Quarterly, Yearly)
- categories (Pet, Housing, Immigration…)
- accounts (Housni, Nyambu, Common)
- priorities (High, Medium, Low)
- people / managers
- currencies, plus the default base currency
- number-format locale
- default budgets folder

## Rendering and write-back
- `registerMarkdownCodeBlockProcessor('budget-catalog' | 'budget', …)` turns each block into an interactive UI in Reading view and Live Preview.
- Every edit runs `app.vault.process(file, …)`. It finds the block's lines with `ctx.getSectionInfo(el)`, replaces the YAML and lets Obsidian re-render. One helper in `store.ts` does this for both block types.
- If the YAML is invalid, the block shows an error box with the parse message and the raw text, instead of overwriting anything.

## UI
**Catalog view**
- Table columns: Name, Amount, Currency, Frequency, Account, Category, Priority, Tags, Manager, plus a description tooltip and edit/delete buttons.
- Filter bar with category, account and tag dropdowns and a text search.
- Clicking a column header sorts by it.
- "Add item" opens `ItemModal`, a form that uses dropdowns filled from the settings lists.

**Budget view** (top to bottom):
1. **Summary cards**:
   - Total cost (sum of allocated amounts)
   - Spent
   - To be spent (allocated minus spent, with overspend highlighted)
   - Credits total
   - Net (credits minus total cost)

   Each card is converted to the base currency using `rates`. If a rate is missing, the card shows per-currency subtotals and a warning.
2. **Items table**:
   - Columns: Name, Category, Account, Manager, Allocated (editable inline), Spent, Balance, and a progress bar.
   - "+ Spend" quickly adds a transaction (amount, date defaulting to today, note).
   - Expanding a row shows its transaction log, where entries can be edited or deleted.
   - Buttons: "Add from catalog" and "Refresh from catalog".
3. **Credits table**: Source, Amount, Currency, Note, with add/edit/delete.
4. **Exchange rates editor**, a small row for each non-base currency in use.

**PickItemsModal**:
- Lists catalog items with checkboxes, using the same filters as the catalog view.
- Has a "select all in filter" option.
- Items already in the budget are marked.
- Confirming snapshots the selected items into the budget.

## Commands
- *Create budget catalog*: creates the note in the default folder if it doesn't exist yet.
- *New budget*: asks for a title, creates the note, then opens PickItemsModal.
- *Add items from catalog to current budget*.

The catalog is found through a settings field (`catalogPath`).

## Files
```
obsidian-budget/
  manifest.json, package.json, tsconfig.json, esbuild.config.mjs, styles.css
  src/main.ts            plugin entry, processors, commands
  src/settings.ts        settings tab with editable lists
  src/types.ts           CatalogItem, BudgetItem, Transaction, Credit, Budget
  src/store.ts           parse/validate YAML, write back to the block, ids
  src/money.ts           format, convert, totals (pure functions)
  src/views/CatalogView.ts
  src/views/BudgetView.ts
  src/modals/ItemModal.ts, PickItemsModal.ts, TransactionModal.ts, CreditModal.ts
  tests/money.test.ts, tests/store.test.ts   (vitest)
```
The UI uses plain Obsidian DOM helpers (`createEl`, `Setting`, `Modal`) with no front-end framework, which keeps the bundle small and matches how Obsidian itself is built.

## Verification
1. `npm run build` compiles without type errors. `npm test` runs the vitest suite, which covers:
   - totals, overspend and conversion, including a missing rate
   - YAML round-trip
   - write-back that replaces only the target block
2. Symlink the plugin into a test vault and enable it. Then:
   - run *Create budget catalog* and add 5 items across 2 currencies and several categories
   - run *New budget*, pick 3 items, add spends, credits and a USD rate
   - check that the summary numbers match by hand
3. Edit a catalog item and confirm the budget doesn't change. Run "Refresh from catalog" and confirm it updates while keeping the transactions.
4. Break the YAML by hand and confirm the error box appears and nothing is overwritten.
5. Check that the views render in both Reading view and Live Preview.
