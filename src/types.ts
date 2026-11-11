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

export interface CatalogItem extends ItemFields {
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

export interface BudgetItem extends ItemFields {
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

export interface ItemFilter {
	search: string;
	category: string;
	account: string;
	tag: string;
}
