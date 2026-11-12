// Settings shape, defaults and migrations. No Obsidian imports, so migrations are testable.

export const DEFAULT_TITLE_FORMAT = "YYYY-MM MMMM";

export type ColorVision = "standard" | "redgreen" | "blueyellow" | "mono";

export const COLOR_VISIONS: { value: ColorVision; label: string }[] = [
	{ value: "standard", label: "Standard" },
	{ value: "redgreen", label: "Red-green (protanopia, deuteranopia)" },
	{ value: "blueyellow", label: "Blue-yellow (tritanopia)" },
	{ value: "mono", label: "Monochrome (achromatopsia)" },
];

export interface BudgetSettings {
	/** Bumped when a migration in migrateSettings() must run once. */
	settingsVersion: number;
	catalogPath: string;
	budgetsFolder: string;
	/** Moment format for the suggested title of a new budget. */
	titleFormat: string;
	baseCurrency: string;
	/** BCP 47 locale for number formatting; empty uses the system default. */
	locale: string;
	currencies: string[];
	frequencies: string[];
	categories: string[];
	accounts: string[];
	priorities: string[];
	managers: string[];
	/** Palette for coloured states; any mode but "standard" also adds shapes and labels. */
	colorVision: ColorVision;
}

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: BudgetSettings = {
	settingsVersion: SETTINGS_VERSION,
	catalogPath: "Budgets/_Catalog.md",
	budgetsFolder: "Budgets",
	titleFormat: DEFAULT_TITLE_FORMAT,
	baseCurrency: "USD",
	locale: "",
	currencies: ["USD", "EUR", "GBP", "KES", "LKR"],
	frequencies: ["One-time", "Weekly", "Monthly", "Quarterly", "Yearly"],
	categories: ["Housing", "Food", "Transport", "Utilities", "Pet", "Immigration", "Health", "Other"],
	accounts: ["Housni", "Common"],
	priorities: ["High", "Medium", "Low"],
	managers: ["Housni"],
	colorVision: "standard",
};

/**
 * Brings saved settings up to date. Each step runs once, guarded by
 * settingsVersion, so later user edits (e.g. removing a currency) stick.
 */
export function migrateSettings(saved: Partial<BudgetSettings> | null): { settings: BudgetSettings; changed: boolean } {
	const settings: BudgetSettings = { ...DEFAULT_SETTINGS, ...saved };
	if (!saved) return { settings, changed: false };
	const from = saved.settingsVersion ?? 0;
	if (from < 1) {
		// v1: KES and LKR joined the default currencies.
		for (const c of ["KES", "LKR"]) if (!settings.currencies.includes(c)) settings.currencies = [...settings.currencies, c];
	}
	settings.settingsVersion = SETTINGS_VERSION;
	return { settings, changed: from < SETTINGS_VERSION };
}
