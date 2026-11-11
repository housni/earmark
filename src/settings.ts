import { App, PluginSettingTab, Setting } from "obsidian";
import type BudgetPlugin from "./main";

export interface BudgetSettings {
	catalogPath: string;
	budgetsFolder: string;
	baseCurrency: string;
	/** BCP 47 locale for number formatting; empty uses the system default. */
	locale: string;
	currencies: string[];
	frequencies: string[];
	categories: string[];
	accounts: string[];
	priorities: string[];
	managers: string[];
}

export const DEFAULT_SETTINGS: BudgetSettings = {
	catalogPath: "Budgets/_Catalog.md",
	budgetsFolder: "Budgets",
	baseCurrency: "USD",
	locale: "",
	currencies: ["USD", "EUR", "GBP"],
	frequencies: ["One-time", "Weekly", "Monthly", "Quarterly", "Yearly"],
	categories: ["Housing", "Food", "Transport", "Utilities", "Pet", "Immigration", "Health", "Other"],
	accounts: ["Housni", "Nyambu", "Common"],
	priorities: ["High", "Medium", "Low"],
	managers: ["Housni", "Nyambu"],
};

type ListKey = "currencies" | "frequencies" | "categories" | "accounts" | "priorities" | "managers";

const LISTS: { key: ListKey; name: string; desc: string }[] = [
	{ key: "currencies", name: "Currencies", desc: "ISO codes (USD, LKR, KES…), one per line." },
	{ key: "frequencies", name: "Frequencies", desc: "One per line." },
	{ key: "categories", name: "Categories", desc: "One per line." },
	{ key: "accounts", name: "Accounts", desc: "Accounts money is taken from, one per line." },
	{ key: "priorities", name: "Priorities", desc: "Highest first, one per line. Used for sorting." },
	{ key: "managers", name: "Managers", desc: "People who manage items, one per line." },
];

export class BudgetSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: BudgetPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Catalog note")
			.setDesc("Path of the note holding the budget-catalog block.")
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

		new Setting(containerEl)
			.setName("Default base currency")
			.setDesc("Totals are converted to this currency. Each budget can override it.")
			.addText((t) =>
				t.setValue(s.baseCurrency).onChange(async (v) => {
					s.baseCurrency = v.trim().toUpperCase();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Number format locale")
			.setDesc("For example en-US or en-LK. Leave empty to use the system locale.")
			.addText((t) =>
				t.setValue(s.locale).onChange(async (v) => {
					s.locale = v.trim();
					await this.plugin.saveSettings();
				}),
			);

		for (const { key, name, desc } of LISTS) {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.setClass("budget-settings-list")
				.addTextArea((t) =>
					t.setValue(s[key].join("\n")).onChange(async (v) => {
						const values = v.split("\n").map((x) => x.trim()).filter(Boolean);
						s[key] = key === "currencies" ? values.map((x) => x.toUpperCase()) : values;
						await this.plugin.saveSettings();
					}),
				);
		}
	}
}
