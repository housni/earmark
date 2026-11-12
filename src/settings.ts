import { App, DropdownComponent, Notice, PluginSettingTab, SettingDefinition, SettingDefinitionItem } from "obsidian";
import {
	BudgetSettings,
	COLOR_VISIONS,
	ColorVision,
	DEFAULT_CATALOG_NAME,
	DEFAULT_TITLE_FORMAT,
	SORTED_LISTS,
	catalogPathOf,
	cleanFolder,
	cleanNoteName,
	sortedList,
} from "./config";
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

	/**
	 * Every row, grouped under its heading. Obsidian renders these and indexes
	 * their names and descriptions for the settings search (1.13.0+).
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const s = this.plugin.settings;
		this.announced.clear();

		let pathValue: HTMLElement | null = null;
		const showPath = () => pathValue?.setText(catalogPathOf(s));
		let colorDropdown: DropdownComponent | null = null;

		return [
			{
				type: "group",
				heading: "Notes",
				items: [
					{
						name: "Folder",
						desc: "Where Earmark keeps your catalog and creates new budgets. Leave empty for the top of your vault.",
						render: (setting) => {
							setting.addText((t) =>
								t.setPlaceholder("Vault root").setValue(s.folder).onChange(async (v) => {
									s.folder = cleanFolder(v);
									showPath();
									await this.plugin.saveSettings();
								}),
							);
						},
					},
					{
						name: "Catalog note",
						desc: "Name of the note in that folder that holds your budget catalog.",
						render: (setting) => {
							const pathEl = setting.descEl.createDiv();
							pathEl.appendText("Catalog: ");
							pathValue = pathEl.createEl("b", { cls: "u-pop" });
							showPath();
							setting.addText((t) =>
								t.setPlaceholder(DEFAULT_CATALOG_NAME).setValue(s.catalogName).onChange(async (v) => {
									s.catalogName = cleanNoteName(v);
									showPath();
									await this.plugin.saveSettings();
								}),
							);
						},
					},
					{
						name: "Budget title format",
						desc: "Suggested title for new budgets, using moment tokens as in Daily Notes. For example YYYY-MM MMMM or YYYYMMDD.",
						aliases: ["date format", "moment"],
						render: (setting) => {
							const sample = setting.descEl.createDiv();
							sample.appendText("Today: ");
							const sampleEl = sample.createEl("b", { cls: "u-pop" });
							setting.addMomentFormat((m) =>
								m
									.setDefaultFormat(DEFAULT_TITLE_FORMAT)
									.setValue(s.titleFormat)
									.setSampleEl(sampleEl)
									.onChange(async (v) => {
										s.titleFormat = v.trim();
										await this.plugin.saveSettings();
									}),
							);
						},
					},
				],
			},
			{
				type: "group",
				heading: "Money",
				items: [
					{
						name: "Default base currency",
						desc: "New budgets convert their totals to this currency. Each budget can change it.",
						render: (setting) => {
							setting.addText((t) =>
								t.setValue(s.baseCurrency).onChange(async (v) => {
									s.baseCurrency = v.trim().toUpperCase();
									await this.save("baseCurrency", "Default base currency");
								}),
							);
						},
					},
					this.list("currencies"),
					{
						name: "Number format locale",
						desc: "How amounts are written, for example en-US or en-KE. Leave empty to use your system's format.",
						render: (setting) => {
							setting.addText((t) =>
								t.setValue(s.locale).onChange(async (v) => {
									s.locale = v.trim();
									await this.save("locale", "Number format locale");
								}),
							);
						},
					},
				],
			},
			{
				type: "group",
				heading: "Lists",
				items: [
					{
						name: "How lists work",
						desc: "These fill the dropdowns when you add or edit an item. Enter one per line.",
						searchable: false,
					},
					...(["categories", "accounts", "managers", "frequencies", "priorities"] as const).map((key) => this.list(key)),
				],
			},
			{
				type: "group",
				heading: "Display",
				items: [
					{
						name: "Colour vision",
						desc:
							"Colours for priorities, overspending and surplus. Any option other than Standard also adds shapes " +
							"and labels (▲▲ ▲ ▽, ⚠ over, striped bars) so colour is never the only cue.",
						aliases: ["color blind", "colour blind", "accessibility", "protanopia", "deuteranopia", "tritanopia"],
						render: (setting) => {
							setting
								.addDropdown((d) => {
									colorDropdown = d;
									for (const { value, label } of COLOR_VISIONS) d.addOption(value, label);
									d.setValue(s.colorVision).onChange(async (v) => {
										await this.plugin.setColorVision(v as ColorVision);
									});
								})
								.addButton((b) =>
									b.setButtonText("Help me choose").onClick(() => {
										new ColorVisionModal(this.app, s.colorVision, s.priorities, (mode) => {
											colorDropdown?.setValue(mode);
											void this.plugin.setColorVision(mode);
										}).open();
									}),
								);
						},
					},
				],
			},
		];
	}

	/** A one-per-line list. Sorted lists save in order as you type and re-order the text when you leave the box. */
	private list(key: ListKey): SettingDefinition {
		const s: BudgetSettings = this.plugin.settings;
		const { name, desc } = LISTS[key];
		return {
			name,
			desc,
			render: (setting) => {
				setting.setClass("budget-settings-list").addTextArea((t) => {
					t.setPlaceholder("One per line").setValue(s[key].join("\n"));
					t.onChange(async (v) => {
						s[key] = cleanList(key, v);
						await this.save(key, name);
					});
					t.inputEl.addEventListener("blur", () => {
						t.setValue(s[key].join("\n"));
					});
				});
			},
		};
	}
}
