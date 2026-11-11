import { App, Modal, Notice, Setting, moment } from "obsidian";
import { newId, num } from "../model";
import type { Transaction } from "../types";
import { addButtons } from "./common";

export class TransactionModal extends Modal {
	private value: Transaction;

	constructor(
		app: App,
		heading: string,
		initial: Transaction | null,
		private onSubmit: (t: Transaction) => void,
	) {
		super(app);
		this.titleEl.setText(heading);
		this.value = initial ? { ...initial } : { id: newId(), date: moment().format("YYYY-MM-DD"), amount: 0, note: "" };
	}

	onOpen(): void {
		const { contentEl } = this;
		const v = this.value;
		const submit = () => {
			if (!v.amount) {
				new Notice("Enter an amount.");
				return;
			}
			this.close();
			this.onSubmit(v);
		};

		new Setting(contentEl).setName("Amount").addText((t) => {
			t.inputEl.type = "number";
			t.inputEl.step = "any";
			t.setValue(v.amount ? String(v.amount) : "").onChange((x) => (v.amount = num(x)));
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.isComposing) submit();
			});
			window.setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(contentEl).setName("Date").addText((t) => {
			t.inputEl.type = "date";
			t.setValue(v.date).onChange((x) => (v.date = x));
		});
		new Setting(contentEl).setName("Note").addText((t) => t.setValue(v.note).onChange((x) => (v.note = x.trim())));

		addButtons(contentEl, "Save", submit, () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
