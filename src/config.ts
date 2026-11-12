// Settings shape, defaults and migrations. No Obsidian imports, so migrations are testable.

export const DEFAULT_TITLE_FORMAT = "YYYY-MM MMMM";
export const DEFAULT_CATALOG_NAME = "Catalog";

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
	/** Vault folder holding the catalog and new budgets; "" is the vault root. */
	folder: string;
	/** Name of the catalog note inside `folder`, without ".md". */
	catalogName: string;
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

export const SETTINGS_VERSION = 4;

export const DEFAULT_SETTINGS: BudgetSettings = {
	settingsVersion: SETTINGS_VERSION,
	folder: "Earmark",
	catalogName: "Catalog",
	titleFormat: DEFAULT_TITLE_FORMAT,
	baseCurrency: "USD",
	locale: "",
	currencies: ["USD", "EUR", "GBP", "KES", "LKR"],
	frequencies: ["One-time", "Weekly", "Monthly", "Quarterly", "Yearly"],
	categories: [
		"Charity/Donation", "Debts", "Entertainment", "Family", "Food", "Health", "Holidays", "Housing",
		"Pet", "Savings", "Subscriptions", "Transport", "Utilities", "Other",
	],
	accounts: ["Common", "Jane", "John"],
	priorities: ["High", "Medium", "Low"],
	managers: ["Jane", "John"],
	colorVision: "standard",
};

/** Folder as typed, without leading/trailing slashes or spaces. */
export function cleanFolder(folder: string): string {
	return folder.trim().replace(/^\/+|\/+$/g, "").trim();
}

/** Note name as typed, without a trailing ".md" or any folder part. */
export function cleanNoteName(name: string): string {
	return name.trim().replace(/\.md$/i, "").split("/").pop()!.trim();
}

/** Vault path of the catalog note, e.g. "Earmark/Catalog.md". */
export function catalogPathOf(s: Pick<BudgetSettings, "folder" | "catalogName">): string {
	const name = cleanNoteName(s.catalogName) || DEFAULT_CATALOG_NAME;
	const folder = cleanFolder(s.folder);
	return folder ? `${folder}/${name}.md` : `${name}.md`;
}

/**
 * Lists kept in A–Z order (see sortedList). Frequencies, priorities and
 * currencies keep the order typed, because their order means something.
 */
export const SORTED_LISTS = ["categories", "accounts", "managers"] as const;

/**
 * Trims, drops blanks and case-insensitive duplicates, and sorts A–Z
 * ignoring case, with any "Other" entry kept last.
 */
export function sortedList(values: string[]): string[] {
	const seen = new Set<string>();
	const unique = values
		.map((v) => v.trim())
		.filter((v) => {
			const key = v.toLowerCase();
			if (!v || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	const isOther = (v: string) => v.toLowerCase() === "other";
	return unique.sort((a, b) => Number(isOther(a)) - Number(isOther(b)) || a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * Default lists shipped by earlier versions. A saved list that still matches
 * one of these (ignoring order and case) was never customised, so a
 * migration may swap it for the current default.
 */
const PREVIOUS_DEFAULTS: Record<(typeof SORTED_LISTS)[number], string[][]> = {
	categories: [["Housing", "Food", "Transport", "Utilities", "Pet", "Immigration", "Health", "Other"]],
	accounts: [["Housni", "Nyambu", "Common"], ["Housni", "Common"]],
	managers: [["Housni", "Nyambu"], ["Housni"]],
};

function sameList(a: string[], b: string[]): boolean {
	const key = (l: string[]) => sortedList(l).map((v) => v.toLowerCase()).join("\n");
	return key(a) === key(b);
}

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
	if (from < 2) {
		// v2: categories, accounts and managers are kept in A–Z order.
		for (const key of SORTED_LISTS) settings[key] = sortedList(settings[key]);
	}
	if (from < 3) {
		// v3: lists still equal to an old default get the new default (#12).
		// Customised lists are left alone.
		for (const key of SORTED_LISTS) {
			if (PREVIOUS_DEFAULTS[key].some((old) => sameList(settings[key], old))) settings[key] = [...DEFAULT_SETTINGS[key]];
		}
	}
	if (from < 4) {
		// v4: the "Catalog note" path and "Budgets folder" became one folder plus a catalog
		// name, so the folder isn't typed twice. Existing installs keep finding their catalog;
		// if it was outside the budgets folder, its folder wins and new budgets go there too.
		const legacy = saved as Record<string, unknown>;
		if (typeof legacy.catalogPath === "string" || typeof legacy.budgetsFolder === "string") {
			const path = cleanFolder(typeof legacy.catalogPath === "string" ? legacy.catalogPath : "Budgets/_Catalog.md");
			const slash = path.lastIndexOf("/");
			settings.folder = slash < 0 ? "" : path.slice(0, slash);
			settings.catalogName = cleanNoteName(path);
		}
		const raw = settings as unknown as Record<string, unknown>;
		delete raw.catalogPath;
		delete raw.budgetsFolder;
	}
	settings.settingsVersion = SETTINGS_VERSION;
	return { settings, changed: from < SETTINGS_VERSION };
}
