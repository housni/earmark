import { App, DropdownComponent, Modal, Setting } from "obsidian";

/** Fills a dropdown with an empty choice, the options, and the current value if it isn't listed. */
export function fillDropdown(d: DropdownComponent, options: string[], value: string, emptyLabel = "—"): void {
	d.addOption("", emptyLabel);
	for (const o of options) d.addOption(o, o);
	if (value && !options.includes(value)) d.addOption(value, value);
	d.setValue(value);
}

export function addButtons(el: HTMLElement, submitText: string, onSubmit: () => void, onCancel: () => void): void {
	new Setting(el)
		.addButton((b) => b.setButtonText("Cancel").onClick(onCancel))
		.addButton((b) => b.setButtonText(submitText).setCta().onClick(onSubmit));
}

export class ConfirmModal extends Modal {
	constructor(app: App, private message: string, private confirmText: string, private onConfirm: () => void) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.createEl("p", { text: this.message });
		addButtons(
			this.contentEl,
			this.confirmText,
			() => {
				this.close();
				this.onConfirm();
			},
			() => this.close(),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class TextPromptModal extends Modal {
	constructor(
		app: App,
		private heading: string,
		private initial: string,
		private onSubmit: (value: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText(this.heading);
		let value = this.initial;
		const submit = () => {
			if (!value.trim()) return;
			this.close();
			this.onSubmit(value.trim());
		};
		new Setting(contentEl).addText((t) => {
			t.setValue(value).onChange((v) => (value = v));
			t.inputEl.addClass("budget-wide-input");
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.isComposing) submit();
			});
			window.setTimeout(() => t.inputEl.select(), 0);
		});
		addButtons(contentEl, "OK", submit, () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
