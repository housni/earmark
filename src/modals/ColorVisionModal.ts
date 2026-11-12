import { App, Modal } from "obsidian";
import { COLOR_VISIONS, ColorVision } from "../config";
import { applyColorVision, priorityBadge } from "../views/ui";

/**
 * Shows the same sample in every colour vision mode so the user can pick the
 * one they read most easily. A preference check, not a diagnosis.
 */
export class ColorVisionModal extends Modal {
	constructor(
		app: App,
		private current: ColorVision,
		private priorities: string[],
		private onChoose: (mode: ColorVision) => void,
	) {
		super(app);
		this.titleEl.setText("Which looks clearest?");
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("budget-plugin", "budget-cvd-picker");
		contentEl.createEl("p", {
			text:
				"Each row shows the same things: three priority levels, an overspent and an on-track balance, " +
				"a surplus and a shortfall, and two progress bars. Choose the row where you can tell them apart most easily.",
		});
		contentEl.createEl("p", {
			cls: "budget-muted",
			text: "This only helps you choose a display. It isn't a colour vision test.",
		});

		const p = this.priorities.length ? this.priorities : ["High", "Medium", "Low"];
		const samples = [p[0], p[Math.floor((p.length - 1) / 2)], p[p.length - 1]].filter((x, i, a) => a.indexOf(x) === i);

		for (const { value, label } of COLOR_VISIONS) {
			const row = contentEl.createDiv({ cls: "budget-cvd-row" });
			if (value === this.current) row.addClass("is-current");
			const sample = row.createDiv({ cls: "budget-plugin budget-cvd-sample" });
			applyColorVision(sample, value);

			sample.createDiv({ cls: "budget-cvd-row-title", text: label + (value === this.current ? " (current)" : "") });
			const line = sample.createDiv({ cls: "budget-cvd-sample-line" });
			for (const pr of samples) priorityBadge(line, pr, p);

			const over = line.createSpan({ cls: "budget-over" });
			over.createSpan({ cls: "budget-balance", text: "−2,000" });
			line.createSpan({ cls: "budget-balance", text: "1,500" });

			for (const [cls, text] of [["budget-pos", "Surplus"], ["budget-neg", "Shortfall"]] as const) {
				line.createSpan({ cls: `budget-card budget-cvd-chip ${cls}` }).createSpan({ cls: "budget-card-label budget-card-value", text });
			}

			for (const isOver of [false, true]) {
				const bar = line.createDiv({ cls: "budget-progress budget-cvd-bar" });
				bar.createDiv({ cls: isOver ? "budget-progress-fill is-over" : "budget-progress-fill" }).setCssProps({
					"--budget-fill": isOver ? "100%" : "60%",
				});
			}

			const use = row.createEl("button", { text: value === this.current ? "Keep this" : "Use this", cls: "mod-cta" });
			use.addEventListener("click", () => {
				this.close();
				this.onChoose(value);
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
