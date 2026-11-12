import { describe, expect, it } from "vitest";
import { balanceOf, formatMoney, summarize, total } from "../src/money";
import type { Budget, BudgetItem } from "../src/types";

function item(amount: number, spends: number[], currency = "LKR"): BudgetItem {
	return {
		id: "i", name: "x", amount, currency, frequency: "", account: "", category: "", priority: "",
		tags: [], description: "", manager: "", created: "", modified: "",
		transactions: spends.map((a, i) => ({ id: `t${i}`, date: "2026-11-01", amount: a, note: "" })),
	};
}

const budget = (over: Partial<Budget>): Budget => ({
	title: "t", baseCurrency: "LKR", rates: {}, items: [], credits: [], ...over,
});

describe("summarize", () => {
	it("computes cost, spent, remaining and net in one currency", () => {
		const s = summarize(
			budget({
				items: [item(100_000, [100_000]), item(20_000, [5_000, 2_500])],
				credits: [{ id: "c1", source: "Bank", amount: 150_000, currency: "LKR", note: "" }],
			}),
		);
		expect(s.totalCost.base).toBe(120_000);
		expect(s.spent.base).toBe(107_500);
		expect(s.toSpend.base).toBe(12_500);
		expect(s.overspent.base).toBe(0);
		expect(s.credits.base).toBe(150_000);
		expect(s.net.base).toBe(30_000);
	});

	it("counts overspend as money still needed, not negative remaining", () => {
		const s = summarize(budget({ items: [item(1_000, [1_500]), item(1_000, [])] }));
		expect(s.toSpend.base).toBe(1_000);
		expect(s.overspent.base).toBe(500);
		// 1,500 spent + 1,000 still to spend
		expect(s.net.base).toBe(-2_500);
	});

	it("converts other currencies with rates", () => {
		const s = summarize(
			budget({
				rates: { USD: 300 },
				items: [item(100, [], "USD"), item(1_000, [])],
				credits: [{ id: "c2", source: "Rebate", amount: 10, currency: "USD", note: "" }],
			}),
		);
		expect(s.totalCost.base).toBe(31_000);
		expect(s.totalCost.byCurrency).toEqual({ USD: 100, LKR: 1_000 });
		expect(s.credits.base).toBe(3_000);
	});

	it("reports missing rates instead of a wrong total", () => {
		const t = total([{ amount: 5, currency: "EUR" }, { amount: 10, currency: "LKR" }], { baseCurrency: "LKR", rates: {} });
		expect(t.base).toBeNull();
		expect(t.missing).toEqual(["EUR"]);
		expect(t.byCurrency).toEqual({ EUR: 5, LKR: 10 });
	});
});

describe("helpers", () => {
	it("balance goes negative when overspent", () => {
		expect(balanceOf(item(10, [4, 8]))).toBe(-2);
	});

	it("formats unknown currency codes without throwing", () => {
		expect(formatMoney(1234.5, "POINTS", "en-US")).toBe("1,234.5 POINTS");
		expect(formatMoney(100000, "USD", "en-US")).toBe("$100,000");
	});
});
