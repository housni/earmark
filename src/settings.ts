import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { BudgetSettings, COLOR_VISIONS, ColorVision, DEFAULT_TITLE_FORMAT, SORTED_LISTS, sortedList } from "./config";
import { ColorVisionModal } from "./modals/ColorVisionModal";
import type BudgetPlugin from "./main";

type ListKey = "currencies" | "frequencies" | "categories" | "accounts" | "priorities" | "managers";

const LISTS: Record<ListKey, { name: string; desc: string }> = {
	categories: {
		name: "Categories",
		desc:
			"What the money is for, such as housing, food or savings. Grouping items by category lets you filter " +
			"a budget and see which parts of your life cost the most. Kept in A–Z order, with Other last.",
	},
	accounts: {
		name: "Accounts",
		desc:
			"Where the money comes from, for example each partner's own account and a shared one. Filter a budget " +
			"by account to see how much each one is paying for. Kept in A–Z order.",
	},
	managers: {
		name: "Executors",
		desc:
			"The people who carry out the spending, such as paying the bill or doing the shopping. Filter a budget " +
			"by executor to see how much to send to each person for the items they handle. Kept in A–Z order.",
	},
	frequencies: {
		name: "Frequencies",
		desc: "How often an item recurs. For reference and filtering; amounts aren't converted.",
	},
	priorities: {
		name: "Priorities",
		desc: "Highest first. The order sets sorting and badge colours: top third high, middle medium, bottom third low.",
	},
	currencies: {
		name: "Currencies",
		desc: "ISO codes such as USD, KES or LKR. These fill the currency dropdowns.",
	},
};

/**
 * Settings that open budget and catalog notes read when they draw, so a change
 * only shows in them after they redraw. Everything else applies immediately.
 */
const REDRAW: ReadonlySet<string> = new Set(["currencies", "priorities", "locale", "baseCurrency"]);

function isSorted(key: ListKey): boolean {
	return (SORTED_LISTS as readonly string[]).includes(key);
}

function cleanList(key: ListKey, text: string): string[] {
	const values = text.split("\n").map((x) => x.trim()).filter(Boolean);
	if (key === "currencies") return values.map((x) => x.toUpperCase());
	return isSorted(key) ? sortedList(values) : values;
}

export class BudgetSettingTab extends PluginSettingTab {
	/** Settings already announced this visit, so typing doesn't repeat the notice. */
	private announced = new Set<string>();

	constructor(app: App, private plugin: BudgetPlugin) {
		super(app, plugin);
	}

	/** Saves, and tells the user once if open notes need to redraw to show this change. */
	private async save(key: string, label: string): Promise<void> {
		await this.plugin.saveSettings();
		if (!REDRAW.has(key) || this.announced.has(key)) return;
		this.announced.add(key);
		new Notice(
			`Earmark: budget and catalog notes that are already open will show the new ${label.toLowerCase()} ` +
				"once you close and reopen them. No restart needed.",
			10000,
		);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();
		this.announced.clear();

		this.heading("Notes");

		new Setting(containerEl)
			.setName("Catalog note")
			.setDesc("Path of the note that holds your budget catalog.")
			.addText((t) =>
				t.setValue(s.catalogPath).onChange(async (v) => {
					s.catalogPath = v.trim();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Budgets folder")
			.setDesc("Where new budget notes are created.")
			.addText((t) =>
				t.setValue(s.budgetsFolder).onChange(async (v) => {
					s.budgetsFolder = v.trim();
					await this.plugin.saveSettings();
				}),
			);

		const title = new Setting(containerEl)
			.setName("Budget title format")
			.setDesc("Suggested title for new budgets, using moment tokens as in Daily Notes. For example YYYY-MM MMMM or YYYYMMDD. ");
		const sample = title.descEl.createEl("div");
		sample.appendText("Today: ");
		const sampleEl = sample.createEl("b", { cls: "u-pop" });
		title.addMomentFormat((m) =>
			m
				.setDefaultFormat(DEFAULT_TITLE_FORMAT)
				.setValue(s.titleFormat)
				.setSampleEl(sampleEl)
				.onChange(async (v) => {
					s.titleFormat = v.trim();
					await this.plugin.saveSettings();
				}),
		);

		this.heading("Money");

		new Setting(containerEl)
			.setName("Default base currency")
			.setDesc("New budgets convert their totals to this currency. Each budget can change it.")
			.addText((t) =>
				t.setValue(s.baseCurrency).onChange(async (v) => {
					s.baseCurrency = v.trim().toUpperCase();
					await this.save("baseCurrency", "Default base currency");
				}),
			);

		this.list("currencies");

		new Setting(containerEl)
			.setName("Number format locale")
			.setDesc("How amounts are written, for example en-US or en-KE. Leave empty to use your system's format.")
			.addText((t) =>
				t.setValue(s.locale).onChange(async (v) => {
					s.locale = v.trim();
					await this.save("locale", "Number format locale");
				}),
			);

		this.heading("Lists", "These fill the dropdowns when you add or edit an item. Enter one per line.");
		for (const key of ["categories", "accounts", "managers", "frequencies", "priorities"] as const) this.list(key);

		this.heading("Display");

		new Setting(containerEl)
			.setName("Colour vision")
			.setDesc(
				"Colours for priorities, overspending and surplus. Any option other than Standard also adds shapes " +
					"and labels (▲▲ ▲ ▽, ⚠ over, striped bars) so colour is never the only cue.",
			)
			.addDropdown((d) => {
				for (const { value, label } of COLOR_VISIONS) d.addOption(value, label);
				d.setValue(s.colorVision).onChange(async (v) => {
					await this.plugin.setColorVision(v as ColorVision);
				});
			})
			.addButton((b) =>
				b.setButtonText("Help me choose").onClick(() =>
					new ColorVisionModal(this.app, s.colorVision, s.priorities, async (mode) => {
						await this.plugin.setColorVision(mode);
						this.display();
					}).open(),
				),
			);
	}

	private heading(name: string, desc?: string): void {
		const h = new Setting(this.containerEl).setName(name).setHeading();
		if (desc) h.setDesc(desc);
	}

	/** A one-per-line list. Sorted lists save in order as you type and re-order the text when you leave the box. */
	private list(key: ListKey): void {
		const s: BudgetSettings = this.plugin.settings;
		const { name, desc } = LISTS[key];
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.setClass("budget-settings-list")
			.addTextArea((t) => {
				t.setPlaceholder("One per line").setValue(s[key].join("\n"));
				t.onChange(async (v) => {
					s[key] = cleanList(key, v);
					await this.save(key, name);
				});
				t.inputEl.addEventListener("blur", () => t.setValue(s[key].join("\n")));
			});
	}
}
