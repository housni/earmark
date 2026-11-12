import { MarkdownPostProcessorContext, Notice, TFile, parseYaml } from "obsidian";
import type BudgetPlugin from "../main";
import { ConfirmModal } from "../modals/common";
import { ItemModal } from "../modals/ItemModal";
import { formatMoney } from "../money";
import { SortKey, errorMessage, isFiltered, matchesFilter, newId, normalizeCatalog, now, sortItems } from "../model";
import { renderError, updateBlock } from "../store";
import { CATALOG_LANG, Catalog } from "../types";
import { FilterState, newFilterState, renderFilterBar } from "./FilterBar";
import { applyColorVision, iconButton, priorityBadge, sortHeader, stampCell } from "./ui";

interface ViewState extends FilterState {
	sortKey: SortKey | "";
	sortDir: 1 | -1;
}

// Survives the re-render that follows every save.
const states = new Map<string, ViewState>();

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
	{ key: "name", label: "Name" },
	{ key: "amount", label: "Amount", num: true },
	{ key: "frequency", label: "Frequency" },
	{ key: "account", label: "Account" },
	{ key: "category", label: "Category" },
	{ key: "priority", label: "Priority" },
	{ key: "tags", label: "Tags" },
	{ key: "manager", label: "Executor" },
	{ key: "created", label: "Created" },
	{ key: "modified", label: "Modified" },
];

export function renderCatalog(plugin: BudgetPlugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
	let catalog: Catalog;
	try {
		catalog = normalizeCatalog(parseYaml(source));
	} catch (e) {
		renderError(el, e, source);
		return;
	}
	const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
	if (!(file instanceof TFile)) return;

	const save = (mutate: (c: Catalog) => void) =>
		updateBlock(plugin.app, file, CATALOG_LANG, ctx.getSectionInfo(el)?.lineStart, normalizeCatalog, mutate).catch(
			(e: unknown) => new Notice(`Earmark: ${errorMessage(e)}`),
		);
	const find = (c: Catalog, id: string) => {
		const i = c.items.findIndex((x) => x.id === id);
		if (i < 0) throw new Error("That item is no longer in the catalog.");
		return i;
	};

	const { settings } = plugin;
	const state: ViewState = states.get(file.path) ?? { ...newFilterState(), sortKey: "name", sortDir: 1 };
	states.set(file.path, state);

	const root = el.createDiv({ cls: "budget-plugin budget-catalog" });
	applyColorVision(root, settings.colorVision);
	const filterBar = renderFilterBar(root, { items: catalog.items, state, onChange: () => renderTable() });

	const add = filterBar.toolbar.createEl("button", { cls: "mod-cta", text: "Add item" });
	add.addEventListener("click", () =>
		new ItemModal(plugin.app, settings, null, (fields) => void save((c) => {
			const at = now();
			c.items.push({ id: newId(), ...fields, created: at, modified: at });
		})).open(),
	);

	const tableWrap = root.createDiv({ cls: "budget-table-wrap" });
	const footer = root.createDiv({ cls: "budget-muted budget-footer" });

	function renderTable(): void {
		tableWrap.empty();
		const rows = sortItems(
			catalog.items.filter((item) => matchesFilter(item, state.filter)),
			state.sortKey,
			state.sortDir,
			settings.priorities,
		);

		footer.setText(`${rows.length} of ${catalog.items.length} items`);
		if (!catalog.items.length) {
			tableWrap.createDiv({ cls: "budget-empty", text: "No items yet. Use “Add item” to start your catalog." });
			return;
		}

		const table = tableWrap.createEl("table", { cls: "budget-table" });
		const head = table.createEl("thead").createEl("tr");
		for (const col of COLUMNS) sortHeader(head, col.label, col.key, state, renderTable, col.num);
		head.createEl("th");

		const body = table.createEl("tbody");
		if (!rows.length && isFiltered(state.filter)) {
			body.createEl("tr").createEl("td", {
				cls: "budget-empty",
				text: "No items match the filters.",
				attr: { colspan: String(COLUMNS.length + 1) },
			});
		}
		for (const item of rows) {
			const tr = body.createEl("tr");
			const name = tr.createEl("td");
			if (item.description) name.createSpan({ cls: "budget-has-desc", text: item.name, attr: { title: item.description } });
			else name.setText(item.name);
			tr.createEl("td", {
				cls: "budget-num",
				text: formatMoney(item.amount, item.currency || settings.baseCurrency, settings.locale),
			});
			tr.createEl("td", { text: item.frequency });
			tr.createEl("td", { text: item.account });
			tr.createEl("td", { text: item.category });
			priorityBadge(tr.createEl("td"), item.priority, settings.priorities);
			const tagCell = tr.createEl("td");
			for (const t of item.tags) tagCell.createSpan({ cls: "budget-tag", text: t });
			tr.createEl("td", { text: item.manager });
			stampCell(tr, item.created);
			stampCell(tr, item.modified);

			const actions = tr.createEl("td", { cls: "budget-actions" });
			iconButton(actions, "pencil", "Edit", () =>
				new ItemModal(plugin.app, settings, item, (fields) =>
					void save((c) => {
						const i = find(c, item.id);
						c.items[i] = { ...c.items[i], ...fields, modified: now() };
					}),
				).open(),
			);
			iconButton(actions, "trash", "Delete", () =>
				new ConfirmModal(plugin.app, `Delete “${item.name}” from the catalog? Budgets keep their copy.`, "Delete", () =>
					void save((c) => {
						c.items.splice(find(c, item.id), 1);
					}),
				).open(),
			);
		}
	}

	renderTable();
}
