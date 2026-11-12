# Testing Earmark

This guide covers building Earmark, loading it into Obsidian, and checking each feature by hand. It also covers the automated tests. Each step says what you should see. If you see something else, it's a bug.

## 1. Build

You need Node.js 18 or newer, or Docker. Run these from the repo root.

**With Node:**
```sh
npm ci           # install exact dependency versions from package-lock.json
npm test         # unit tests (vitest)
npm run build    # type-check, then write main.js
```

**With Docker** (no local Node needed):
```sh
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/app -w /app \
  node:22-slim sh -c "npm ci && npm test && npm run build"
```

A successful build leaves `main.js` next to `manifest.json` and `styles.css`. Obsidian loads those three files.

## 2. Install into a vault

Use a **test vault**, or back up your real one first:
```sh
cp -a /path/to/vault /path/to/vault.bak
```
Earmark writes to the notes it renders.

You can install it in either of two ways:

- **Symlink** (best while developing, because rebuilds show up immediately):
  ```sh
  ln -s "$PWD" /path/to/vault/.obsidian/plugins/earmark
  ```
- **Copy**:
  ```sh
  mkdir -p /path/to/vault/.obsidian/plugins/earmark
  cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/earmark/
  ```

Then in Obsidian:
1. Go to **Settings → Community plugins** and turn off Restricted mode if it's on.
2. Click the refresh icon next to *Installed plugins* and turn on **Earmark**.
3. Press **Ctrl/Cmd+Shift+I** to open the developer console. Keep it open, because errors from the plugin appear there.

To remove it, turn the plugin off, delete `.obsidian/plugins/earmark`, and delete the `Budgets/` test notes.

### Rebuilding while you work
- `npm run dev` (or the Docker command above with `npm run dev` and `-it`) rebuilds `main.js` on every save.
- Obsidian doesn't reload plugins on its own. After a rebuild, do one of the following:
  - turn Earmark off and on again
  - run **Reload app without saving** from the command palette
  - install the community plugin **Hot-Reload**, which reloads a symlinked plugin automatically

## 3. Set up for the walkthrough

The walkthrough uses Sri Lankan rupees (LKR) as the base currency and US dollars (USD) as a second currency. Open **Settings → Earmark** and set:

| Setting | Value |
|---|---|
| Default base currency | `LKR` |
| Currencies | should list `USD, EUR, GBP, KES, LKR`. On an existing install, `KES` and `LKR` are added once, automatically, the first time this version loads. |
| Budgets folder / Catalog note | leave as `Budgets` and `Budgets/_Catalog.md`, or point them at a scratch folder |

The other lists in settings (frequencies, categories, accounts, priorities, managers) fill the dropdowns in the item form. You can change any of them.

How numbers are displayed (symbols, separators) depends on your system locale, or on the *Number format locale* setting. The amounts below are written as plain numbers.

## 4. Feature walkthrough

### 4.1 Catalog
1. Open the command palette (**Ctrl/Cmd+P**) and run **Earmark: Open or create budget catalog**.
   - You should see that `Budgets/_Catalog.md` is created and opened.
   - In Reading view or Live Preview, it shows a toolbar (search, filters, **Add item**) and "No items yet."
2. Click **Add item** and create these items:

   | Name | Amount | Currency | Frequency | Account | Category | Priority | Tags | Managed by |
   |---|---|---|---|---|---|---|---|---|
   | Rent | 100000 | LKR | Monthly | Common | Housing | High | fixed | Housni |
   | Vet | 15000 | LKR | One-time | Common | Pet | Medium | | Housni |
   | Visa fee | 200 | USD | One-time | Housni | Immigration | High | visa, docs | Housni |

   Give **Rent** a description, for example "Apartment rent".

   Check that:
   - each item appears as a row after you save it
   - the description shows as a dotted underline on the name, with a tooltip on hover
   - saving an item with no name is blocked with a notice
3. **Sorting**: click the *Amount* header. Rows sort by amount and a ▲ appears; click again for ▼. Sorting by *Priority* follows the order in settings (High first).
4. **Filtering**:
   - Type in **Search**. It matches name, description, manager, category, account and tags, ignoring case.
   - Click **Filters** to open the panel. It has a dropdown for each field you've used (category, account, tag, frequency, priority, manager, currency), plus ranges for amount, created and modified.
   - Set one or two filters. The button reads **Filters (n)** and the footer reads "N of 3 items".
   - **Clear** resets everything, including the search. A filter that matches nothing shows "No items match the filters."
5. **Edit**: use the pencil on *Vet* to change the amount to 15500, then back to 15000. **Delete**: use the trash icon on a throwaway item. A confirmation appears before anything is removed.
6. Switch to Source mode. The block is YAML, and each item has an `id`.

### 4.2 Create a budget
1. In **Settings → Earmark → Budget title format**, try `YYYYMMDD`. The "Today:" sample under the setting updates as you type, for example `20261112`. Clear the box: the sample shows the default format, `2026-11 November`. Leave it empty or set it back to `YYYY-MM MMMM`.
2. Run **Earmark: New budget**. The suggested title follows the format, for example `2026-11 November`. Accept it, or type your own.
3. In the picker, check that you can search and use the same **Filters** panel, and that **Select visible** selects only what's shown. The submit button counts selected items ("Add 3 items"). Select all three and confirm.
   - You should see `Budgets/<title>.md` created and opened.
   - It has a header with the title, a base-currency dropdown, and the buttons **Open catalog**, **Add from catalog**, **Add custom item** and **Refresh from catalog**.
   - **Open catalog** opens the catalog note, the same as the command does. Go back to the budget afterwards.
4. With no exchange rate yet, the *Total cost* card shows **—**. Below it are per-currency subtotals (115,000 LKR + 200 USD) and **"Needs a rate for USD"**, with **USD** as a link.
5. Click the **USD** link. The page scrolls to **Exchange rates**, the "1 USD = … LKR" box gets the cursor, and the row is outlined for a moment.

### 4.3 Exchange rates
1. In the box you just jumped to, under **Exchange rates**, enter `300` and press Tab or Enter.
   - The warning goes away and *Total cost* reads **175,000 LKR**: 100,000 + 15,000 + 200 × 300.

### 4.4 Spending
1. On **Rent**, click **⊕** (Add spending) and enter 100000 with today's date. The modal opens with today's date filled in.
2. On **Vet**, add two entries: 5000 and 12000.
3. Click the chevron on *Vet* to open its log. Both entries are listed with date, amount and note, and each has edit and delete icons.

You should see:
- Rent's progress bar full, with a balance of 0.
- Vet **overspent**: balance −2,000 shown in red, and a red progress bar.
- The cards:

  | Card | Expected |
  |---|---|
  | Total cost | 175,000 |
  | Spent | 117,000 |
  | To be spent | 60,000 (only the visa fee is left) |
  | Overspent | 2,000 (this card only appears when something is overspent) |

4. Edit one Vet entry, then delete one. The delete asks for confirmation, and the totals update after each change.
5. Change **Allocated** for Vet inline, to 17000, then press Tab. Overspent disappears, and focus moves to the next input instead of being lost.

### 4.5 Credits
1. Set Vet's allocation back to 15000, so the numbers below match.
2. Click **Add credit** and add **Bank account**: 150000 LKR. Then add **Tax rebate**: 100 USD.

You should see:
- *Credits* reads **180,000** (150,000 + 100 × 300).
- The last card reads **Surplus: 3,000**. That's 180,000 − (117,000 spent + 60,000 still to spend).

3. Delete the bank credit (it asks first). The card turns red and changes to **Shortfall**. Add the credit again afterwards.

### 4.6 Snapshot and refresh
1. Back in the catalog, change **Rent** to 110000.
   - The budget **doesn't change**, because budgets keep their own copy.
2. In the budget, click **Refresh from catalog**. Confirm the "Update 3 items…" prompt.
   - Rent's allocation becomes 110,000, and its spending entries are kept.
3. Click **Add from catalog** again. Items already in the budget are marked **in budget** in the picker.
4. Click **Add custom item** to add an item that isn't in the catalog. It isn't touched by refresh.

### 4.7 Base currency
1. Switch the budget's base-currency dropdown from LKR to **USD**.
   - The rates are converted: you now see "1 LKR = 0.0033… USD".
   - Each card shows the same money in dollars: the LKR value ÷ 300. For example, 175,000 LKR becomes about 583.33 USD. After 4.6 your total is higher, so note the LKR value before switching.
2. Switch back to LKR. The totals return to the LKR values.
3. Remove the USD rate (clear the box), then switch to a currency with no rate, such as EUR.
   - A confirmation explains that the rates can't be converted and offers **Switch and clear**.

### 4.8 Editing the YAML by hand
1. In Source mode, add `paid: true` under an item, and `notes: test` at the top level of the budget. Then make any change in the UI.
   - Both keys are still there after the save.
2. Break the YAML, for example by deleting a colon.
   - The block shows **"Couldn't read this block"** with the parse error and the raw text.
   - Nothing is overwritten. Fix the YAML and the UI comes back.
3. Add an item by hand with no `id` and click its edit button. The save works, and an `id` is written to the item.

### 4.9 Created and modified dates
Both tables have **Created** and **Modified** columns. They show the local date; hover over one to see the full date and time.
1. In the catalog, the items you added in 4.1 show today's date in both columns. Edit one item: only its **Modified** date changes, though you'll only see a difference on a later day. Hover to compare the times.
2. In the budget, the dates belong to the budget's own copy of each item, not to the catalog item. The copies were created when you added them to the budget.
3. Anything that changes a budget item updates its **Modified** time:
   - logging, editing or deleting spending
   - changing **Allocated**
   - editing the item
   - **Refresh from catalog**, which keeps the item's **Created** date

   Hover over **Modified** before and after each change to see the time move.
4. Items written before this version have no dates and show **—**. To try it, add an item by hand in Source mode without `created`/`modified`.
5. Click the **Created** or **Modified** header to sort. Items without dates stay at the bottom whether you sort ascending (▲) or descending (▼).
6. In Source mode, each item has `created:` and `modified:` lines with ISO timestamps, e.g. `2026-11-12T13:40:00.000Z`.

### 4.10 Sorting and filtering a budget
1. **Sorting**: click any of the budget table's headers except the chevron, progress and action columns. The first click sorts ascending ▲, the second descending ▼, and the third returns to the budget's own order.
   - *Priority* follows the order in settings.
   - *Spent* and *Balance* sort by the current figures. Overspent items have negative balances, so they come first in ascending order.
2. **Filtering**: the budget has the same search and **Filters** panel as the catalog, plus **Status**: *Not started*, *In progress*, *Fully spent* or *Overspent*. With the 4.4 data:
   - *Overspent* shows only Vet.
   - *Fully spent* shows only Rent.
3. **Filtered totals**: filter to category *Housing*. A note appears above the cards: "Filtered: 1 of 3 items…".
   - *Total cost*, *Spent* and *To be spent* now cover Rent only.
   - *Credits* and *Surplus/Shortfall* still cover the whole budget.
   - **Clear filters** in the note resets everything.
4. Filters and sorting stay in place after you log spending or edit an item, while the note is open.

### 4.11 Priority colours and colour vision
1. With **Settings → Earmark → Colour vision** on *Standard*:
   - Priority badges in the catalog, budget and picker are coloured by level: *High* red, *Medium* orange, *Low* blue, using your theme's shades.
   - Priorities are split into thirds of the settings list, so the colours still work if you add more levels. A priority not in the list gets a plain, uncoloured badge.
2. Click **Help me choose**. A window shows four rows, one per mode. Each has three priority badges, an overspent and an on-track balance, *Surplus*/*Shortfall* chips and two progress bars, one normal and one overspent.
   - The current mode is outlined and marked "(current)".
   - Click **Use this** on another row. The window closes, the dropdown changes, and any open catalog or budget switches at once, with no reload needed.
3. In any mode other than *Standard*, check the cues that don't rely on colour:
   - Priorities show **▲▲** (high), **▲** (medium) and **▽** (low).
   - Vet's balance reads **"−2,000 ⚠ over"**, and its progress bar is striped and slightly taller.
   - The *Surplus* card reads **▲ Surplus**, and *Shortfall* and *Overspent* show **▼**.
4. Try each palette in light and dark themes (**Settings → Appearance**). Text and badges should stay readable in both. *Monochrome* uses only greys, with a filled badge for high priority and a dashed one for low.
5. Switch back to *Standard*. The shapes and labels disappear and the theme colours return.

### 4.12 Edge cases
- **Reading view and Live Preview**: repeat a couple of actions in each. Both views should behave the same.
- **Callouts and lists**: put a ```` ```budget ```` block inside a `> [!note]` callout, or indent it under a list item. Saves keep the `> ` or indent prefix on every line.
- **Two budgets in one note**: their buttons each edit their own block. The command **Earmark: Add items from catalog to current budget** says the note has several budgets and asks you to use the button instead.
- **Missing catalog**: point *Catalog note* in settings at a path that doesn't exist and run **New budget**. A notice explains, and an empty budget is still created.
- **Mobile** (optional, since the plugin isn't desktop-only): sync the vault to a phone and check that tables scroll sideways and the modals fit on screen.

## 5. Automated tests

`npm test` runs vitest over the pure modules, `src/model.ts` and `src/money.ts`. These cover:
- totals, overspend and currency conversion, including missing rates
- normalizing YAML, keeping unknown keys, and generating stable ids
- finding and replacing blocks, including CRLF line endings, callouts and lists
- snapshots and refresh
- rebasing exchange rates

UI code (`src/views`, `src/modals`) and `src/store.ts` depend on the Obsidian API, so they are covered by the manual walkthrough above. When you add logic, put it in a pure module and test it in `tests/`.

## 6. Reporting a problem

Please include:
- what you did and what you expected
- any error from the developer console
- the YAML of the affected block, from Source mode
