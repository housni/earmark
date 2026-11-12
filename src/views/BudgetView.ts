import { MarkdownPostProcessorContext, Notice, TFile, parseYaml, setIcon } from "obsidian";
import type BudgetPlugin from "../main";
import { ConfirmModal } from "../modals/common";
import { CreditModal } from "../modals/CreditModal";
import { ItemModal, emptyFields } from "../modals/ItemModal";
import { TransactionModal } from "../modals/TransactionModal";
import { Total, balanceOf, formatMoney, spentOf, summarize } from "../money";
import {
	SortKey,
	distinct,
	errorMessage,
	isFiltered,
	matchesFilter,
	newId,
	normalizeBudget,
	now,
	num,
	rebaseRates,
	sortItems,
} from "../model";
import { renderError, updateBlock } from "../store";
import { BUDGET_LANG, Budget, BudgetItem, Credit } from "../types";
import { FilterState, newFilterState, renderFilterBar } from "./FilterBar";
import { applyColorVision, iconButton, priorityBadge, sortHeader, stampCell } from "./ui";

// Module state survives the re-render that follows every save.
/** Item ids whose spending log is open. */
const expanded = new Set<string>();
/** The input focused last, so tabbing between inputs survives a save. */
let lastFocus: { key: string; at: number } | null = null;

interface ViewState extends FilterState {
	sortKey: SortKey | "";
	sortDir: 1 | -1;
}
/** Filters and sorting per budget block (note path + block line). */
const states = new Map<string, ViewState>();

const ITEM_COLUMNS: { key?: SortKey; label: string; num?: boolean }[] = [
	{ label: "" },
	{ key: "name", label: "Name" },
	{ key: "priority", label: "Priority" },
	{ key: "category", label: "Category" },
	{ key: "account", label: "Account" },
	{ key: "manager", label: "Manager" },
	{ key: "amount", label: "Allocated", num: true },
	{ key: "spent", label: "Spent", num: true },
	{ key: "balance", label: "Balance", num: true },
	{ key: "created", label: "Created" },
	{ key: "modified", label: "Modified" },
	{ label: "" },
	{ label: "" },
];

function byId<T extends { id: string }>(list: T[], id: string, what: string): number {
	const i = list.findIndex((x) => x.id === id);
	if (i < 0) throw new Error(`That ${what} is no longer in the budget.`);
	return i;
}

export function renderBudget(plugin: BudgetPlugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
	const { settings } = plugin;
	const normalize = (raw: unknown) => normalizeBudget(raw, settings.baseCurrency);
	let budget: Budget;
	try {
		budget = normalize(parseYaml(source));
	} catch (e) {
		renderError(el, e, source);
		return;
	}
	const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
	if (!(file instanceof TFile)) return;

	const lineStart = () => ctx.getSectionInfo(el)?.lineStart;
	const save = (mutate: (b: Budget) => void) =>
		updateBlock(plugin.app, file, BUDGET_LANG, lineStart(), normalize, mutate).catch(
			(e: unknown) => new Notice(`Earmark: ${errorMessage(e)}`),
		);
	/** Changes one item and marks it modified. */
	const saveItem = (id: string, fn: (target: BudgetItem, b: Budget) => void) =>
		save((b) => {
			const target = b.items[byId(b.items, id, "item")];
			fn(target, b);
			target.modified = now();
		});
	const saveCredit = (id: string, fn: (b: Budget, index: number) => void) =>
		save((b) => fn(b, byId(b.credits, id, "credit")));

	const base = budget.baseCurrency;
	const money = (amount: number, currency = base) => formatMoney(amount, currency, settings.locale);
	const root = el.createDiv({ cls: "budget-plugin budget-view" });
	applyColorVision(root, settings.colorVision);
	root.addEventListener("focusin", (e) => {
		const key = (e.target as HTMLElement).dataset?.budgetFocus;
		if (key) lastFocus = { key, at: Date.now() };
	});

	// Header
	const header = root.createDiv({ cls: "budget-header" });
	header.createEl("h3", { text: budget.title || file.basename });
	const controls = header.createDiv({ cls: "budget-toolbar" });
	const baseSel = controls.createEl("select", { cls: "dropdown", attr: { "aria-label": "Base currency" } });
	for (const c of distinct([...settings.currencies, base])) baseSel.createEl("option", { value: c, text: c });
	baseSel.value = base;
	baseSel.addEventListener("change", () => {
		const next = baseSel.value;
		const apply = (clear: boolean) =>
			save((b) => {
				b.rates = (clear ? null : rebaseRates(b.rates, b.baseCurrency, next)) ?? {};
				b.baseCurrency = next;
			});
		if (rebaseRates(budget.rates, base, next)) void apply(false);
		else {
			baseSel.value = base;
			new ConfirmModal(
				plugin.app,
				`There's no ${next} rate to convert the existing exchange rates with. Switch to ${next} and clear them?`,
				"Switch and clear",
				() => void apply(true),
			).open();
		}
	});
	button(controls, "Open catalog", () => void plugin.openCatalog());
	button(controls, "Add from catalog", () => void plugin.addItemsFromCatalog(file, lineStart()), true);
	button(controls, "Add custom item", () =>
		new ItemModal(
			plugin.app,
			settings,
			{ ...emptyFields(settings), currency: base },
			(fields) =>
				void save((b) =>
					b.items.push({
						...fields,
						id: newId(),
						currency: fields.currency || b.baseCurrency,
						created: now(),
						modified: now(),
						transactions: [],
					}),
				),
			"New item",
		).open(),
	);
	if (budget.items.some((i) => i.sourceId)) {
		button(controls, "Refresh from catalog", () => void plugin.refreshFromCatalog(file, lineStart()));
	}

	const stateKey = `${file.path}#${lineStart() ?? 0}`;
	const state: ViewState = states.get(stateKey) ?? { ...newFilterState(), sortKey: "", sortDir: 1 };
	states.set(stateKey, state);

	// Summary. Item cards follow the filters; credits and surplus/shortfall are whole-budget.
	const summaryEl = root.createDiv();

	// Items
	section(root, "Items");
	const filterBar = renderFilterBar(root, { items: budget.items, state, status: true, onChange: () => refresh() });
	const itemsWrap = root.createDiv({ cls: "budget-table-wrap" });

	refresh();

	function refresh(): void {
		const visible = budget.items.filter((i) => matchesFilter(i, state.filter));
		renderSummary(visible);
		renderItems(sortItems(visible, state.sortKey, state.sortDir, settings.priorities));
	}

	function renderSummary(visible: BudgetItem[]): void {
		summaryEl.empty();
		const filtered = isFiltered(state.filter);
		if (filtered) {
			const note = summaryEl.createDiv({ cls: "budget-filter-note" });
			note.appendText(
				`Filtered: ${visible.length} of ${budget.items.length} items. Credits and surplus/shortfall are for the whole budget. `,
			);
			const clear = note.createEl("a", { text: "Clear filters", href: "#" });
			clear.addEventListener("click", (e) => {
				e.preventDefault();
				filterBar.clear();
			});
		}
		const whole = summarize(budget);
		const s = filtered ? summarize({ ...budget, items: visible }) : whole;
		const cards = summaryEl.createDiv({ cls: "budget-cards" });
		card(cards, "Total cost", s.totalCost);
		card(cards, "Spent", s.spent);
		card(cards, "To be spent", s.toSpend);
		if (Object.keys(s.overspent.byCurrency).length) card(cards, "Overspent", s.overspent, "budget-neg");
		card(cards, "Credits", whole.credits);
		const net = whole.net.base ?? 0;
		card(cards, net < 0 ? "Shortfall" : "Surplus", whole.net, net < 0 ? "budget-neg" : "budget-pos");
	}

	function renderItems(rows: BudgetItem[]): void {
		itemsWrap.empty();
		if (!budget.items.length) {
			itemsWrap.createDiv({ cls: "budget-empty", text: "No items yet. Use “Add from catalog” to pick some." });
			return;
		}
		const table = itemsWrap.createEl("table", { cls: "budget-table" });
		const head = table.createEl("thead").createEl("tr");
		for (const col of ITEM_COLUMNS) {
			if (col.key) sortHeader(head, col.label, col.key, state, refresh, col.num, true);
			else head.createEl("th");
		}
		const body = table.createEl("tbody");
		if (!rows.length) {
			body.createEl("tr").createEl("td", {
				cls: "budget-empty",
				text: "No items match the filters.",
				attr: { colspan: String(ITEM_COLUMNS.length) },
			});
		}
		for (const item of rows) renderItemRow(body, item);
	}

	function renderItemRow(body: HTMLElement, item: BudgetItem): void {
		const isOpen = expanded.has(item.id);
		const spent = spentOf(item);
		const balance = balanceOf(item);
		const tr = body.createEl("tr", { cls: balance < 0 ? "budget-over" : "" });

		const toggle = tr.createEl("td", { cls: "budget-toggle" });
		const chevron = toggle.createEl("button", {
			cls: "clickable-icon budget-icon-btn",
			attr: { "aria-label": isOpen ? "Hide spending" : `Show spending (${item.transactions.length})` },
		});
		setIcon(chevron, isOpen ? "chevron-down" : "chevron-right");
		chevron.addEventListener("click", () => {
			if (isOpen) expanded.delete(item.id);
			else expanded.add(item.id);
			el.empty();
			renderBudget(plugin, source, el, ctx);
		});

		const name = tr.createEl("td", { text: item.name });
		if (item.description) {
			name.title = item.description;
			name.addClass("budget-has-desc");
		}
		const prio = tr.createEl("td");
		if (item.priority) priorityBadge(prio, item.priority, settings.priorities);
		tr.createEl("td", { text: item.category });
		tr.createEl("td", { text: item.account });
		tr.createEl("td", { text: item.manager });

		const alloc = tr.createEl("td", { cls: "budget-num" });
		const input = alloc.createEl("input", {
			type: "number",
			cls: "budget-amount-input",
			value: String(item.amount),
			attr: { "data-budget-focus": `alloc-${item.id}`, step: "any" },
		});
		input.addEventListener("change", () => void saveItem(item.id, (t) => (t.amount = num(input.value))));
		if (item.currency !== base) alloc.createSpan({ cls: "budget-muted", text: ` ${item.currency}` });

		tr.createEl("td", { cls: "budget-num", text: money(spent, item.currency) });
		tr.createEl("td", { cls: "budget-num budget-balance", text: money(balance, item.currency) });
		stampCell(tr, item.created);
		stampCell(tr, item.modified);

		const progress = tr.createEl("td", { cls: "budget-progress-cell" });
		const ratio = item.amount > 0 ? spent / item.amount : spent > 0 ? 1 : 0;
		const bar = progress.createDiv({ cls: "budget-progress", attr: { "aria-label": `${Math.round(ratio * 100)}% spent` } });
		bar.createDiv({ cls: ratio > 1 ? "budget-progress-fill is-over" : "budget-progress-fill" }).setCssProps({
			"--budget-fill": `${Math.min(ratio, 1) * 100}%`,
		});

		const actions = tr.createEl("td", { cls: "budget-actions" });
		iconButton(actions, "plus-circle", "Add spending", () =>
			new TransactionModal(plugin.app, `Spend on ${item.name}`, null, (t) => {
				expanded.add(item.id);
				void saveItem(item.id, (target) => target.transactions.push(t));
			}).open(),
		);
		iconButton(actions, "pencil", "Edit item", () =>
			new ItemModal(plugin.app, settings, item, (fields) =>
				void saveItem(item.id, (target, b) => {
					Object.assign(target, fields, { currency: fields.currency || b.baseCurrency });
				}),
			).open(),
		);
		iconButton(actions, "trash", "Remove from budget", () => {
			const n = item.transactions.length;
			new ConfirmModal(
				plugin.app,
				n
					? `Remove “${item.name}” and its ${n} spending entr${n === 1 ? "y" : "ies"} from this budget?`
					: `Remove “${item.name}” from this budget?`,
				"Remove",
				() => void saveItem(item.id, (_t, b) => b.items.splice(byId(b.items, item.id, "item"), 1)),
			).open();
		});

		if (!isOpen) return;
		const sub = body.createEl("tr", { cls: "budget-subrow" }).createEl("td", { attr: { colspan: String(ITEM_COLUMNS.length) } });
		if (!item.transactions.length) {
			sub.createDiv({ cls: "budget-empty", text: "No spending recorded yet." });
			return;
		}
		const log = sub.createEl("table", { cls: "budget-table budget-log" });
		for (const t of item.transactions) {
			const row = log.createEl("tr");
			row.createEl("td", { text: t.date });
			row.createEl("td", { cls: "budget-num", text: money(t.amount, item.currency) });
			row.createEl("td", { text: t.note, cls: "budget-muted" });
			const act = row.createEl("td", { cls: "budget-actions" });
			iconButton(act, "pencil", "Edit spending", () =>
				new TransactionModal(plugin.app, `Edit spending on ${item.name}`, t, (nt) =>
					void saveItem(item.id, (target) => {
						target.transactions[byId(target.transactions, t.id, "spending entry")] = nt;
					}),
				).open(),
			);
			iconButton(act, "trash", "Delete spending", () =>
				new ConfirmModal(plugin.app, `Delete ${money(t.amount, item.currency)} spent on ${t.date || "this item"}?`, "Delete", () =>
					void saveItem(item.id, (target) => {
						target.transactions.splice(byId(target.transactions, t.id, "spending entry"), 1);
					}),
				).open(),
			);
		}
	}

	// Credits
	const creditHead = section(root, "Credits");
	button(creditHead, "Add credit", () =>
		new CreditModal(plugin.app, settings, base, null, (c) => void save((b) => b.credits.push(c))).open(),
	);
	const creditsWrap = root.createDiv({ cls: "budget-table-wrap" });
	if (!budget.credits.length) {
		creditsWrap.createDiv({ cls: "budget-empty", text: "Add the money available for this budget: bank accounts, rebates, salary…" });
	} else {
		const table = creditsWrap.createEl("table", { cls: "budget-table" });
		const head = table.createEl("thead").createEl("tr");
		head.createEl("th", { text: "Source" });
		head.createEl("th", { text: "Amount", cls: "budget-num" });
		head.createEl("th", { text: "Note" });
		head.createEl("th");
		const body = table.createEl("tbody");
		for (const credit of budget.credits) renderCreditRow(body, credit);
	}

	function renderCreditRow(body: HTMLElement, credit: Credit): void {
		const tr = body.createEl("tr");
		tr.createEl("td", { text: credit.source });
		tr.createEl("td", { cls: "budget-num", text: money(credit.amount, credit.currency) });
		tr.createEl("td", { cls: "budget-muted", text: credit.note });
		const act = tr.createEl("td", { cls: "budget-actions" });
		iconButton(act, "pencil", "Edit credit", () =>
			new CreditModal(plugin.app, settings, base, credit, (c) => void saveCredit(credit.id, (b, i) => (b.credits[i] = c))).open(),
		);
		iconButton(act, "trash", "Delete credit", () =>
			new ConfirmModal(plugin.app, `Delete the “${credit.source}” credit?`, "Delete", () =>
				void saveCredit(credit.id, (b, i) => b.credits.splice(i, 1)),
			).open(),
		);
	}

	// Exchange rates for every non-base currency in use.
	const foreign = distinct([
		...budget.items.map((i) => i.currency),
		...budget.credits.map((c) => c.currency),
		...Object.keys(budget.rates),
	]).filter((c) => c !== base);
	if (foreign.length) {
		section(root, "Exchange rates");
		const rates = root.createDiv({ cls: "budget-rates" });
		for (const cur of foreign) {
			const row = rates.createDiv({ cls: "budget-rate" });
			row.createSpan({ text: `1 ${cur} =` });
			const input = row.createEl("input", {
				type: "number",
				cls: "budget-amount-input",
				value: budget.rates[cur] ? String(budget.rates[cur]) : "",
				placeholder: "rate",
				attr: { "data-budget-focus": `rate-${cur}`, step: "any" },
			});
			input.addEventListener("change", () =>
				void save((b) => {
					const r = num(input.value);
					if (r > 0) b.rates[cur] = r;
					else delete b.rates[cur];
				}),
			);
			row.createSpan({ text: base });
		}
	}

	// Put focus back on the input the user had moved to before the save re-rendered.
	if (lastFocus && Date.now() - lastFocus.at < 3000) {
		const target = root.querySelector<HTMLInputElement>(`[data-budget-focus="${CSS.escape(lastFocus.key)}"]`);
		if (target) window.setTimeout(() => target.focus(), 0);
	}

	function card(parent: HTMLElement, label: string, t: Total, cls = ""): void {
		const c = parent.createDiv({ cls: `budget-card ${cls}` });
		c.createDiv({ cls: "budget-card-label", text: label });
		c.createDiv({ cls: "budget-card-value", text: t.base === null ? "—" : money(t.base) });
		const currencies = Object.keys(t.byCurrency);
		if (currencies.length > 1 || (currencies.length === 1 && currencies[0] !== base)) {
			const parts = currencies.sort().map((cur) => money(t.byCurrency[cur], cur));
			c.createDiv({ cls: "budget-card-sub", text: parts.join(" + ") });
		}
		if (t.missing.length) {
			const warn = c.createDiv({ cls: "budget-card-warn", text: "Needs a rate for " });
			t.missing.forEach((cur, i) => {
				if (i) warn.appendText(", ");
				const link = warn.createEl("a", { text: cur, href: "#", attr: { "aria-label": `Add the ${cur} exchange rate` } });
				link.addEventListener("click", (e) => {
					e.preventDefault();
					focusRate(cur);
				});
			});
		}
	}

	/** Scrolls to a currency's exchange-rate input, focuses it and briefly highlights its row. */
	function focusRate(cur: string): void {
		const input = root.querySelector<HTMLInputElement>(`[data-budget-focus="${CSS.escape(`rate-${cur}`)}"]`);
		if (!input) return;
		const row = input.closest(".budget-rate");
		input.scrollIntoView({ behavior: "smooth", block: "center" });
		input.focus({ preventScroll: true });
		row?.addClass("is-highlighted");
		window.setTimeout(() => row?.removeClass("is-highlighted"), 1600);
	}
}

function section(parent: HTMLElement, title: string): HTMLElement {
	const head = parent.createDiv({ cls: "budget-section-head" });
	head.createEl("h4", { text: title });
	return head;
}

function button(parent: HTMLElement, text: string, onClick: () => void, cta = false): void {
	const b = parent.createEl("button", { text, cls: cta ? "mod-cta" : "" });
	b.addEventListener("click", onClick);
}
