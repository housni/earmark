export const CATALOG_LANG = "budget-catalog";
export const BUDGET_LANG = "budget";

/** Fields shared by catalog items and the snapshots kept in budgets. */
export interface ItemFields {
	name: string;
	amount: number;
	currency: string;
	frequency: string;
	account: string;
	category: string;
	priority: string;
	tags: string[];
	description: string;
	manager: string;
}

/** ISO timestamps, or "" for items written before dates were tracked. */
export interface Stamps {
	created: string;
	modified: string;
}

export interface CatalogItem extends ItemFields, Stamps {
	id: string;
}

export interface Catalog {
	items: CatalogItem[];
}

export interface Transaction {
	id: string;
	date: string;
	amount: number;
	note: string;
}

export interface BudgetItem extends ItemFields, Stamps {
	id: string;
	/** Id of the catalog item this was snapshotted from. */
	sourceId?: string;
	transactions: Transaction[];
}

export interface Credit {
	id: string;
	source: string;
	amount: number;
	currency: string;
	note: string;
}

export interface Budget {
	title: string;
	baseCurrency: string;
	/** 1 unit of the key currency = rate units of the base currency. */
	rates: Record<string, number>;
	items: BudgetItem[];
	credits: Credit[];
}

/** Where a budget item's spending stands against its allocation. */
export type ItemStatus = "not-started" | "in-progress" | "spent" | "over";

/** Every field is "" when unused. Amounts are input text; dates are YYYY-MM-DD. */
export interface ItemFilter {
	/** Matches name, description, tags, manager, category and account. */
	search: string;
	category: string;
	account: string;
	tag: string;
	frequency: string;
	priority: string;
	manager: string;
	currency: string;
	amountMin: string;
	amountMax: string;
	createdFrom: string;
	createdTo: string;
	modifiedFrom: string;
	modifiedTo: string;
	/** Budget items only. */
	status: ItemStatus | "";
}
