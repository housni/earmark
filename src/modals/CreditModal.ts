import { App, Modal, Notice, Setting } from "obsidian";
import { newId, num } from "../model";
import type { BudgetSettings } from "../config";
import type { Credit } from "../types";
import { addButtons, fillDropdown } from "./common";

export class CreditModal extends Modal {
	private value: Credit;

	constructor(
		app: App,
		private settings: BudgetSettings,
		baseCurrency: string,
		initial: Credit | null,
		private onSubmit: (c: Credit) => void,
	) {
		super(app);
		this.titleEl.setText(initial ? "Edit credit" : "Add credit");
		this.value = initial ? { ...initial } : { id: newId(), source: "", amount: 0, currency: baseCurrency, note: "" };
	}

	onOpen(): void {
		const { contentEl } = this;
		const v = this.value;

		new Setting(contentEl).setName("Source").addText((t) => {
			t.setPlaceholder("Bank account, tax rebate…").setValue(v.source).onChange((x) => (v.source = x.trim()));
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
				fillDropdown(d, this.settings.currencies, v.currency, "Currency");
				d.onChange((x) => (v.currency = x));
			});
		new Setting(contentEl).setName("Note").addText((t) => t.setValue(v.note).onChange((x) => (v.note = x.trim())));

		addButtons(
			contentEl,
			"Save",
			() => {
				if (!v.source) {
					new Notice("Enter where the money comes from.");
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
