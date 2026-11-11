import type { Budget, BudgetItem } from "./types";

export interface Total {
	byCurrency: Record<string, number>;
	/** Sum converted to the base currency, or null when a rate is missing. */
	base: number | null;
	missing: string[];
}

export interface Summary {
	totalCost: Total;
	spent: Total;
	toSpend: Total;
	overspent: Total;
	credits: Total;
	/** Credits minus everything spent or still to be spent. */
	net: Total;
}

interface Entry {
	amount: number;
	currency: string;
}

export function spentOf(item: BudgetItem): number {
	return item.transactions.reduce((sum, t) => sum + t.amount, 0);
}

export function balanceOf(item: BudgetItem): number {
	return item.amount - spentOf(item);
}

export function total(entries: Entry[], budget: Pick<Budget, "baseCurrency" | "rates">): Total {
	const byCurrency: Record<string, number> = {};
	const missing = new Set<string>();
	let base = 0;
	for (const { amount, currency } of entries) {
		if (amount === 0) continue;
		const cur = currency || budget.baseCurrency;
		byCurrency[cur] = (byCurrency[cur] ?? 0) + amount;
		if (cur === budget.baseCurrency) base += amount;
		else if (budget.rates[cur] > 0) base += amount * budget.rates[cur];
		else missing.add(cur);
	}
	return { byCurrency, base: missing.size ? null : base, missing: [...missing].sort() };
}

export function summarize(budget: Budget): Summary {
	const per = (f: (i: BudgetItem) => number): Entry[] =>
		budget.items.map((i) => ({ amount: f(i), currency: i.currency }));
	const credits = budget.credits.map((c) => ({ amount: c.amount, currency: c.currency }));
	return {
		totalCost: total(per((i) => i.amount), budget),
		spent: total(per(spentOf), budget),
		toSpend: total(per((i) => Math.max(balanceOf(i), 0)), budget),
		overspent: total(per((i) => Math.max(-balanceOf(i), 0)), budget),
		credits: total(credits, budget),
		net: total(
			[...credits, ...per((i) => -(spentOf(i) + Math.max(balanceOf(i), 0)))],
			budget,
		),
	};
}

export function formatMoney(amount: number, currency: string, locale?: string): string {
	const opts = { minimumFractionDigits: 0, maximumFractionDigits: 2 };
	if (currency) {
		try {
			return new Intl.NumberFormat(locale || undefined, { ...opts, style: "currency", currency }).format(amount);
		} catch {
			// Not an ISO 4217 code; fall through to number + label.
		}
	}
	const n = new Intl.NumberFormat(locale || undefined, opts).format(amount);
	return currency ? `${n} ${currency}` : n;
}
