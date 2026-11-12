# Earmark

Earmark is an Obsidian plugin. Keep a catalog of budget items, build budgets from it, and track spending, credits and balances. Everything lives in your notes as YAML inside fenced code blocks.

## Install

Until Earmark is in the community plugin store, install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable **BRAT** from Community plugins.
2. Run **BRAT: Add a beta plugin for testing** and enter `housni/earmark`.
3. Enable **Earmark** under Community plugins. BRAT keeps it updated as new releases come out.

To install by hand instead, download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/housni/earmark/releases/latest) into `<vault>/.obsidian/plugins/earmark/`.

Earmark needs Obsidian 1.13.0 or later.

## Use

1. **Open or create budget catalog** (command palette) creates `Earmark/Catalog.md`. You can change the folder and the catalog note's name in settings. Click **Add item** to add rent, vet bills, visa fees and so on.
2. **New budget** suggests a title using your *Budget title format* (moment tokens, default `YYYY-MM MMMM`). It then lets you pick items from the catalog and creates a budget note.
3. In the budget note:
   - **⊕** logs spending against an item. The chevron shows its log.
   - Edit **Allocated** inline.
   - **Add credit** records money coming in (bank account, tax rebate…).
   - Enter **exchange rates** for any currency other than the base currency.
   - The cards at the top show total cost, spent, still to be spent, credits, and the resulting surplus or shortfall.
   - If a rate is missing, the warning names the currency as a link that jumps to its exchange-rate box. **Open catalog** takes you to the catalog.

Budget items are *copies* of catalog items, so editing the catalog never changes a past budget. **Refresh from catalog** pulls the current values while keeping your spending.

Both the catalog and budgets:
- **Search and filter** by every field: category, account, tag, frequency, priority, executor, currency, amount range, and created/modified dates. Budgets can also filter by spending status (not started, in progress, fully spent, overspent). While a budget is filtered, its cost and spending cards cover only the visible items.
- **Sort** by clicking any column header.
- Track **created** and **modified** dates for every item.

Frequencies, categories, accounts, priorities, executors, currencies and the title format are all configured in the plugin settings.

### Colour vision

Priorities are coloured by level, and overspending and surplus have their own colours. Under **Settings → Colour vision** you can pick a palette for red-green colour blindness (protanopia, deuteranopia), blue-yellow (tritanopia) or monochrome (achromatopsia). Choosing any of them also adds shapes and labels, so colour is never the only cue:
- priorities show ▲▲, ▲ or ▽
- overspent balances say "⚠ over"
- overspent bars are striped
- surplus and shortfall show ▲ and ▼

**Help me choose** shows the same sample in every palette, so you can pick the one you read most easily.

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

CI runs the tests and the build on every push to `main` and on every pull request. A release is published when you push a version tag.

### 1. Pick the version

Start from a clean working tree on an up-to-date `main` (`git status`, `git pull`). Then choose the kind of bump:

| Bump | When | Example |
|---|---|---|
| `patch` | bug fixes only | 0.1.1 → 0.1.2 |
| `minor` | new features, existing notes still work | 0.1.1 → 0.2.0 |
| `major` | breaking changes, e.g. to the YAML format | 0.1.1 → 1.0.0 |

### 2. Bump the version

`npm version` runs `version-bump.mjs`, which bumps `package.json`, `manifest.json` and `versions.json`. It then commits and tags the new version. Tags have no `v` prefix (`0.1.2`), because Obsidian requires the tag to equal the manifest version. Never edit these versions by hand.

**With Node installed:**

```sh
npm version patch   # or minor / major
```

**With Docker** (no local Node needed):

```sh
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$HOME/.config/git/config":/tmp/.config/git/config:ro \
  -v "$PWD":/app -w /app \
  node:22 npm version patch   # or minor / major
```

- Use `node:22`, not `node:22-slim`. `npm version` needs git, and only the full image includes it.
- Your git config is mounted read-only so the commit carries your name and email. If yours lives at `~/.gitconfig`, mount `-v "$HOME/.gitconfig":/tmp/.gitconfig:ro` instead.
- The container has no access to your GPG or SSH signing keys. If you sign commits or tags, use the native command instead.

Either way, check the result before pushing:

```sh
git log --oneline -1      # a commit named after the new version, e.g. "0.1.2"
git tag --points-at HEAD  # the same version
```

### 3. Push

Pushing happens on the host in both cases, so your normal SSH keys and credentials are used:

```sh
git push --follow-tags
```

The tag starts the release workflow (`.github/workflows/release.yml`), which:
1. installs, tests and builds the plugin
2. fails if the tag doesn't match the `manifest.json` or `package.json` version
3. attests the build provenance of `main.js`, `manifest.json` and `styles.css`, so anyone can check them with `gh attestation verify <file> --repo housni/earmark`
4. publishes a GitHub Release with those three files

BRAT users get the update automatically.

To follow the run and check the release (with the [GitHub CLI](https://cli.github.com/)):

```sh
gh run watch                    # pick the Release run
gh release view 0.1.2           # should list 3 assets
```

### If something goes wrong

- **Bumped but not pushed yet:** undo the bump with `git tag -d 0.1.2 && git reset --hard HEAD~1`.
- **The workflow failed after pushing:** fix the problem, then release the next version, for example `0.1.3`. Don't move or reuse a tag that has already been pushed, because BRAT and other users may have seen it.

## License

[MIT](LICENSE)
