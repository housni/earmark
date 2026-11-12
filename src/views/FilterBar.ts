import { activeFilterCount, distinct, emptyFilter, isFiltered, type ListItem } from "../model";
import type { ItemFilter, ItemStatus } from "../types";

export interface FilterState {
	filter: ItemFilter;
	/** Whether the filter panel is expanded. */
	open: boolean;
}

export function newFilterState(): FilterState {
	return { filter: emptyFilter(), open: false };
}

export interface FilterBarOptions {
	/** Items whose values fill the dropdowns. */
	items: ListItem[];
	state: FilterState;
	/** Show the budget-only status filter. */
	status?: boolean;
	/** Called after any filter changes. */
	onChange: () => void;
}

export interface FilterBar {
	/** Toolbar row, for callers to append their own buttons to. */
	toolbar: HTMLElement;
	/** Clears every filter, including the search, and calls onChange. */
	clear(): void;
}

type Choice = "category" | "account" | "tag" | "frequency" | "priority" | "manager" | "currency";

const CHOICES: { key: Choice; label: string; values: (items: ListItem[]) => string[] }[] = [
	{ key: "category", label: "Category", values: (items) => items.map((i) => i.category) },
	{ key: "account", label: "Account", values: (items) => items.map((i) => i.account) },
	{ key: "tag", label: "Tag", values: (items) => items.flatMap((i) => i.tags) },
	{ key: "frequency", label: "Frequency", values: (items) => items.map((i) => i.frequency) },
	{ key: "priority", label: "Priority", values: (items) => items.map((i) => i.priority) },
	{ key: "manager", label: "Manager", values: (items) => items.map((i) => i.manager) },
	{ key: "currency", label: "Currency", values: (items) => items.map((i) => i.currency) },
];

const STATUSES: { value: ItemStatus; label: string }[] = [
	{ value: "not-started", label: "Not started" },
	{ value: "in-progress", label: "In progress" },
	{ value: "spent", label: "Fully spent" },
	{ value: "over", label: "Overspent" },
];

/**
 * Search box plus a collapsible panel with a filter for every item field.
 * Changes are written to `state.filter`, so they survive re-renders.
 */
export function renderFilterBar(parent: HTMLElement, o: FilterBarOptions): FilterBar {
	const { state } = o;
	const f = state.filter;
	const wrap = parent.createDiv({ cls: "budget-filterbar" });
	const toolbar = wrap.createDiv({ cls: "budget-toolbar" });

	const search = toolbar.createEl("input", {
		type: "search",
		placeholder: "Search…",
		value: f.search,
		attr: { "aria-label": "Search items", "data-budget-focus": "search" },
	});
	search.addEventListener("input", () => {
		f.search = search.value;
		changed();
	});

	const toggle = toolbar.createEl("button", { cls: "budget-filter-toggle" });
	const clearBtn = toolbar.createEl("button", { text: "Clear" });
	const panel = wrap.createDiv({ cls: "budget-filter-panel" });

	toggle.addEventListener("click", () => {
		state.open = !state.open;
		indicators();
	});
	clearBtn.addEventListener("click", () => clear());

	fillPanel();
	indicators();

	function fillPanel(): void {
		panel.empty();
		for (const { key, label, values } of CHOICES) {
			const options = distinct(values(o.items));
			if (!options.length && !f[key]) continue;
			const sel = field(label).createEl("select", { cls: "dropdown" });
			sel.createEl("option", { value: "", text: "Any" });
			for (const v of distinct([...options, f[key]])) sel.createEl("option", { value: v, text: v });
			sel.value = f[key];
			sel.addEventListener("change", () => {
				f[key] = sel.value;
				changed();
			});
		}

		if (o.status) {
			const sel = field("Status").createEl("select", { cls: "dropdown" });
			sel.createEl("option", { value: "", text: "Any" });
			for (const s of STATUSES) sel.createEl("option", { value: s.value, text: s.label });
			sel.value = f.status;
			sel.addEventListener("change", () => {
				f.status = sel.value as ItemStatus | "";
				changed();
			});
		}

		range("Amount", "number", "amountMin", "amountMax", "min", "max");
		range("Created", "date", "createdFrom", "createdTo", "from", "to");
		range("Modified", "date", "modifiedFrom", "modifiedTo", "from", "to");
	}

	function field(label: string): HTMLElement {
		const el = panel.createEl("label", { cls: "budget-filter-field" });
		el.createSpan({ cls: "budget-filter-label", text: label });
		return el;
	}

	function range(
		label: string,
		type: "number" | "date",
		fromKey: "amountMin" | "createdFrom" | "modifiedFrom",
		toKey: "amountMax" | "createdTo" | "modifiedTo",
		fromHint: string,
		toHint: string,
	): void {
		const el = field(label).createDiv({ cls: "budget-filter-range" });
		for (const [key, hint] of [[fromKey, fromHint], [toKey, toHint]] as const) {
			const input = el.createEl("input", {
				type,
				value: f[key],
				placeholder: hint,
				attr: { "aria-label": `${label} ${hint}`, ...(type === "number" ? { step: "any" } : {}) },
			});
			input.addEventListener(type === "number" ? "input" : "change", () => {
				f[key] = input.value;
				changed();
			});
		}
	}

	function indicators(): void {
		const n = activeFilterCount(f);
		toggle.setText(n ? `Filters (${n})` : "Filters");
		toggle.setAttr("aria-expanded", String(state.open));
		toggle.toggleClass("is-active", n > 0);
		panel.toggleClass("budget-hidden", !state.open);
		clearBtn.toggleClass("budget-hidden", !isFiltered(f));
	}

	function changed(): void {
		indicators();
		o.onChange();
	}

	function clear(): void {
		Object.assign(f, emptyFilter());
		search.value = "";
		fillPanel();
		changed();
	}

	return { toolbar, clear };
}
