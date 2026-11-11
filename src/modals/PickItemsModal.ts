import { App, Modal } from "obsidian";
import { formatMoney } from "../money";
import { distinct, matchesFilter } from "../model";
import type { BudgetSettings } from "../settings";
import type { CatalogItem, ItemFilter } from "../types";
import { addButtons } from "./common";

export class PickItemsModal extends Modal {
	private filter: ItemFilter = { search: "", category: "", account: "", tag: "" };
	private selected = new Set<string>();
	private listEl!: HTMLElement;
	private submitBtn?: HTMLButtonElement;
	private submitted = false;

	/** Resolves with the chosen items, or an empty list if the modal is dismissed. */
	static pick(app: App, settings: BudgetSettings, catalog: CatalogItem[], existing: Set<string>): Promise<CatalogItem[]> {
		return new Promise((resolve) => new PickItemsModal(app, settings, catalog, existing, resolve).open());
	}

	constructor(
		app: App,
		private settings: BudgetSettings,
		private catalog: CatalogItem[],
		/** Catalog ids already in the budget. */
		private existing: Set<string>,
		private onSubmit: (items: CatalogItem[]) => void,
	) {
		super(app);
		this.titleEl.setText("Add items from catalog");
	}

	onOpen(): void {
		const { contentEl, filter } = this;
		contentEl.addClass("budget-plugin", "budget-picker");

		const bar = contentEl.createDiv({ cls: "budget-toolbar" });
		const search = bar.createEl("input", { type: "search", placeholder: "Search…" });
		search.addEventListener("input", () => {
			filter.search = search.value;
			this.renderList();
		});
		const dropdown = (label: string, options: string[], key: "category" | "account" | "tag") => {
			const sel = bar.createEl("select", { cls: "dropdown" });
			sel.createEl("option", { value: "", text: label });
			for (const o of options) sel.createEl("option", { value: o, text: o });
			sel.addEventListener("change", () => {
				filter[key] = sel.value;
				this.renderList();
			});
		};
		dropdown("All categories", distinct(this.catalog.map((i) => i.category)), "category");
		dropdown("All accounts", distinct(this.catalog.map((i) => i.account)), "account");
		dropdown("All tags", distinct(this.catalog.flatMap((i) => i.tags)), "tag");

		const selectAll = bar.createEl("button", { text: "Select visible" });
		selectAll.addEventListener("click", () => {
			for (const i of this.visible()) this.selected.add(i.id);
			this.renderList();
		});

		this.listEl = contentEl.createDiv({ cls: "budget-pick-list" });
		this.renderList();

		addButtons(
			contentEl,
			"Add selected",
			() => {
				this.submitted = true;
				this.onSubmit(this.catalog.filter((i) => this.selected.has(i.id)));
				this.close();
			},
			() => this.close(),
		);
		this.submitBtn = contentEl.querySelector<HTMLButtonElement>("button.mod-cta") ?? undefined;
		this.updateCount();
	}

	private visible(): CatalogItem[] {
		return this.catalog.filter((i) => matchesFilter(i, this.filter));
	}

	private renderList(): void {
		const el = this.listEl;
		el.empty();
		const items = this.visible();
		if (!items.length) {
			el.createDiv({ cls: "budget-empty", text: this.catalog.length ? "No items match." : "The catalog is empty." });
		}
		for (const item of items) {
			const row = el.createEl("label", { cls: "budget-pick-row" });
			const cb = row.createEl("input", { type: "checkbox" });
			cb.checked = this.selected.has(item.id);
			cb.addEventListener("change", () => {
				if (cb.checked) this.selected.add(item.id);
				else this.selected.delete(item.id);
				this.updateCount();
			});
			const text = row.createDiv({ cls: "budget-pick-text" });
			const title = text.createDiv({ cls: "budget-pick-name", text: item.name });
			if (this.existing.has(item.id)) title.createSpan({ cls: "budget-badge", text: "in budget" });
			text.createDiv({
				cls: "budget-muted",
				text: [item.category, item.account, item.frequency, item.manager].filter(Boolean).join(" · "),
			});
			row.createDiv({
				cls: "budget-num",
				text: formatMoney(item.amount, item.currency || this.settings.baseCurrency, this.settings.locale),
			});
		}
		this.updateCount();
	}

	private updateCount(): void {
		if (this.submitBtn) {
			const n = this.selected.size;
			this.submitBtn.setText(n ? `Add ${n} item${n === 1 ? "" : "s"}` : "Add selected");
			this.submitBtn.disabled = n === 0;
		}
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) this.onSubmit([]);
	}
}
