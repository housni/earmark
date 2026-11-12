# Earmark

Earmark is an Obsidian plugin. Keep a catalog of budget items, build budgets from it, and track spending, credits and balances. Everything lives in your notes as YAML inside fenced code blocks.

## Install

Until Earmark is in the community plugin store, install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable **BRAT** from Community plugins.
2. Run **BRAT: Add a beta plugin for testing** and enter `housni/earmark`.
3. Enable **Earmark** under Community plugins. BRAT keeps it updated as new releases come out.

To install by hand instead, download `earmark-<version>.zip` from the [latest release](https://github.com/housni/earmark/releases/latest) and unzip it into `<vault>/.obsidian/plugins/`.

## Use

1. **Open or create budget catalog** (command palette) creates `Budgets/_Catalog.md`. Click **Add item** to add rent, vet bills, visa fees and so on.
2. **New budget** asks for a title, lets you pick items from the catalog, and creates a budget note.
3. In the budget note:
   - **⊕** logs spending against an item. The chevron shows its log.
   - Edit **Allocated** inline.
   - **Add credit** records money coming in (bank account, tax rebate…).
   - Enter **exchange rates** for any currency other than the base currency.
   - The cards at the top show total cost, spent, still to be spent, credits, and the resulting surplus or shortfall.

Budget items are *copies* of catalog items, so editing the catalog never changes a past budget. **Refresh from catalog** pulls the current values while keeping your spending.

Frequencies, categories, accounts, priorities, managers and currencies are all configured in the plugin settings.

## Data format

````
```budget
title: November 2026
baseCurrency: LKR
rates: { USD: 300 }
items:
  - name: Rent
    amount: 100000
    currency: LKR
    category: Housing
    account: Common
    sourceId: k3f9
    transactions:
      - { date: 2026-11-03, amount: 100000, note: paid }
credits:
  - { source: Bank account, amount: 250000, currency: LKR }
```
````

You can edit the YAML by hand. Keys you add yourself are kept, but `# comments` inside the block are lost the next time the plugin saves it. If the YAML doesn't parse, the block shows the error and the plugin won't overwrite it.

## Develop

```sh
npm install
npm run dev     # watch build → main.js
npm test        # vitest
npm run build   # type-check + production build
```

Symlink this folder into `<vault>/.obsidian/plugins/earmark/` and enable the plugin.

See [TESTING.md](TESTING.md) for build options (including Docker), installing into a vault, and a step-by-step walkthrough of every feature with expected results.

## Release

CI runs the tests and the build on every push to `main` and on every pull request. To publish a release:

```sh
npm version patch   # or minor / major
git push --follow-tags
```

`npm version` bumps `package.json`, `manifest.json` and `versions.json`, then commits and tags the new version (`0.1.1`, with no `v`). Pushing the tag runs the release workflow. It tests, builds, checks that the tag matches the manifest, and publishes a GitHub Release with `main.js`, `manifest.json`, `styles.css` and a zip of all three.
