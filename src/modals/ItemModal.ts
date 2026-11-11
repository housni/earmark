import { App, Modal, Notice, Setting } from "obsidian";
import { num } from "../model";
import type { BudgetSettings } from "../settings";
import type { ItemFields } from "../types";
import { addButtons, fillDropdown } from "./common";

export function emptyFields(settings: BudgetSettings): ItemFields {
	return {
		name: "",
		amount: 0,
		currency: settings.baseCurrency,
		frequency: "",
		account: "",
		category: "",
		priority: "",
		tags: [],
		description: "",
		manager: "",
	};
}

/** Copies only the editable fields, so extras (ids, transactions) never round-trip. */
function pickFields(i: ItemFields): ItemFields {
	const { name, amount, currency, frequency, account, category, priority, tags, description, manager } = i;
	return { name, amount, currency, frequency, account, category, priority, tags: [...tags], description, manager };
}

export class ItemModal extends Modal {
	private value: ItemFields;

	constructor(
		app: App,
		private settings: BudgetSettings,
		initial: ItemFields | null,
		private onSubmit: (fields: ItemFields) => void,
		title?: string,
	) {
		super(app);
		this.value = initial ? pickFields(initial) : emptyFields(settings);
		this.titleEl.setText(title ?? (initial ? "Edit item" : "New item"));
	}

	onOpen(): void {
		const { contentEl, settings } = this;
		const v = this.value;
		contentEl.addClass("budget-plugin");

		new Setting(contentEl).setName("Name").addText((t) => {
			t.setPlaceholder("Rent").setValue(v.name).onChange((x) => (v.name = x.trim()));
			window.setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(contentEl)
			.setName("Amount")
			.addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.step = "any";
				t.setValue(v.amount ? String(v.amount) : "").onChange((x) => (v.amount = num(x)));
			})
			.addDropdown((d) => {
				fillDropdown(d, settings.currencies, v.currency, "Currency");
				d.onChange((x) => (v.currency = x));
			});

		const choice = (name: string, options: string[], key: "frequency" | "account" | "category" | "priority" | "manager") =>
			new Setting(contentEl).setName(name).addDropdown((d) => {
				fillDropdown(d, options, v[key]);
				d.onChange((x) => (v[key] = x));
			});
		choice("Frequency", settings.frequencies, "frequency");
		choice("Account", settings.accounts, "account");
		choice("Category", settings.categories, "category");
		choice("Priority", settings.priorities, "priority");
		choice("Managed by", settings.managers, "manager");

		new Setting(contentEl)
			.setName("Tags")
			.setDesc("Comma separated.")
			.addText((t) =>
				t.setValue(v.tags.join(", ")).onChange(
					(x) => (v.tags = x.split(",").map((s) => s.trim()).filter(Boolean)),
				),
			);
		new Setting(contentEl).setName("Description").addTextArea((t) =>
			t.setValue(v.description).onChange((x) => (v.description = x.trim())),
		);

		addButtons(
			contentEl,
			"Save",
			() => {
				if (!v.name) {
					new Notice("Give the item a name.");
					return;
				}
				this.close();
				this.onSubmit(v);
			},
			() => this.close(),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
