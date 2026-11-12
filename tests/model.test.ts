import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
	catalogNeedsIds,
	findBlocks,
	isoDate,
	matchesFilter,
	monthTitle,
	normalizeBudget,
	normalizeCatalog,
	rebaseRates,
	refreshItem,
	replaceBlockBody,
	snapshotItem,
	toPlain,
} from "../src/model";

const NOTE = [
	"# November",
	"",
	"```budget",
	"title: Nov",
	"```",
	"",
	"text between",
	"",
	"````budget",
	"title: Second",
	"````",
	"tail",
].join("\n");

describe("findBlocks / replaceBlockBody", () => {
	it("finds each block with its fence lines", () => {
		const blocks = findBlocks(NOTE, "budget");
		expect(blocks.map((b) => [b.start, b.end, b.body])).toEqual([
			[2, 4, "title: Nov"],
			[8, 10, "title: Second"],
		]);
		expect(findBlocks(NOTE, "budget-catalog")).toEqual([]);
	});

	it("replaces only the target block", () => {
		const [, second] = findBlocks(NOTE, "budget");
		const out = replaceBlockBody(NOTE, second, "title: Changed\nrates: {}\n");
		expect(out).toBe(NOTE.replace("title: Second", "title: Changed\nrates: {}"));
	});

	it("keeps CRLF line endings", () => {
		const crlf = NOTE.replace(/\n/g, "\r\n");
		const [first] = findBlocks(crlf, "budget");
		const out = replaceBlockBody(crlf, first, "title: A\nx: 1");
		expect(out).toBe(crlf.replace("title: Nov", "title: A\r\nx: 1"));
	});

	it("handles blocks inside callouts and lists", () => {
		const note = "> [!note]\n> ```budget\n> title: A\n> ```\n- item\n  ```budget\n  title: B\n  ```";
		const [callout, listed] = findBlocks(note, "budget");
		expect([callout.prefix, callout.body, listed.prefix, listed.body]).toEqual(["> ", "title: A", "  ", "title: B"]);
		const out = replaceBlockBody(note, listed, "title: C\nrates: {}");
		expect(out.split("\n").slice(5, 9)).toEqual(["  ```budget", "  title: C", "  rates: {}", "  ```"]);
	});

	it("ignores an unclosed block", () => {
		expect(findBlocks("```budget\ntitle: x\n", "budget")).toEqual([]);
	});
});

describe("normalize", () => {
	it("fills defaults and coerces types", () => {
		const b = normalizeBudget(
			parse(`
items:
  - name: Rent
    amount: "100,000"
    tags: fixed, home
    transactions:
      - { date: 2026-11-03, amount: 500 }
credits:
  - { source: Bank, amount: 10, currency: usd }
rates: { usd: 300, eur: 0 }
`),
			"LKR",
		);
		expect(b.baseCurrency).toBe("LKR");
		expect(b.rates).toEqual({ USD: 300 });
		expect(b.items[0]).toMatchObject({ amount: 100000, currency: "LKR", tags: ["fixed", "home"] });
		expect(b.items[0].transactions[0]).toMatchObject({ date: "2026-11-03", amount: 500, note: "" });
		expect(b.credits[0].currency).toBe("USD");
	});

	it("treats an empty block as an empty budget", () => {
		expect(normalizeBudget(null, "USD")).toEqual({ title: "", baseCurrency: "USD", rates: {}, items: [], credits: [] });
	});

	it("rejects the wrong shape", () => {
		expect(() => normalizeBudget(parse("- a\n- b"), "USD")).toThrow(/mapping/);
		expect(() => normalizeCatalog(parse("items: nope"))).toThrow(/list/);
	});

	it("round-trips through YAML unchanged", () => {
		const b = normalizeBudget(
			parse("title: T\nbaseCurrency: LKR\nrates: { USD: 300 }\nitems:\n  - { name: A, amount: 5, sourceId: k1 }\n"),
			"LKR",
		);
		expect(normalizeBudget(parse(stringify(toPlain(b))), "LKR")).toEqual(b);
	});

	it("keeps hand-added keys and gives id-less entries stable ids", () => {
		const raw = parse("notes: keep me\nitems:\n  - { name: A, amount: 5, paid: true, transactions: [{ amount: 1 }] }");
		const a = normalizeBudget(raw, "LKR");
		const b = normalizeBudget(raw, "LKR");
		expect(a.items[0].id).toBe(b.items[0].id);
		expect(a.items[0].transactions[0].id).toBe(b.items[0].transactions[0].id);
		const plain = toPlain(a) as unknown as Record<string, unknown>;
		expect(plain.notes).toBe("keep me");
		expect((plain.items as Record<string, unknown>[])[0]).toMatchObject({ paid: true });
	});

	it("writes items compactly", () => {
		const b = normalizeBudget(parse("items:\n  - { id: x, name: A, amount: 5 }"), "LKR");
		expect(toPlain(b).items[0]).toEqual({ id: "x", name: "A", amount: 5, currency: "LKR" });
		expect(toPlain(b).credits).toEqual([]);
	});

	it("rebases exchange rates onto a new base currency", () => {
		// base LKR: 1 USD = 300 LKR, 1 EUR = 330 LKR
		expect(rebaseRates({ USD: 300, EUR: 330 }, "LKR", "USD")).toEqual({ LKR: Number((1 / 300).toPrecision(8)), EUR: 1.1 });
		expect(rebaseRates({ EUR: 330 }, "LKR", "USD")).toBeNull();
		expect(rebaseRates({}, "LKR", "USD")).toEqual({});
	});

	it("detects catalog items that need ids", () => {
		expect(catalogNeedsIds(parse("items:\n  - { name: A }"))).toBe(true);
		expect(catalogNeedsIds(parse("items:\n  - { id: a1, name: A }"))).toBe(false);
	});
});

describe("snapshots", () => {
	const [rent] = normalizeCatalog(
		parse("items:\n  - { id: k1, name: Rent, amount: 100, category: Housing, tags: [fixed] }"),
	).items;

	it("copies catalog values and links back by id", () => {
		const snap = snapshotItem(rent, "LKR");
		expect(snap).toMatchObject({ name: "Rent", amount: 100, currency: "LKR", sourceId: "k1", transactions: [] });
		expect(snap.id).not.toBe("k1");
		snap.tags.push("x");
		expect(rent.tags).toEqual(["fixed"]);
	});

	it("refresh keeps spending", () => {
		const snap = snapshotItem(rent, "LKR");
		snap.transactions.push({ id: "t1", date: "2026-11-01", amount: 40, note: "" });
		const refreshed = refreshItem(snap, { ...rent, amount: 120 }, "LKR");
		expect(refreshed.amount).toBe(120);
		expect(refreshed.id).toBe(snap.id);
		expect(refreshed.transactions).toHaveLength(1);
	});

	it("filters by category, tag and search text", () => {
		expect(matchesFilter(rent, { search: "", category: "Housing", account: "", tag: "fixed" })).toBe(true);
		expect(matchesFilter(rent, { search: "ren", category: "", account: "", tag: "" })).toBe(true);
		expect(matchesFilter(rent, { search: "", category: "Pet", account: "", tag: "" })).toBe(false);
	});
});

describe("dates", () => {
	it("formats local dates without moment", () => {
		const d = new Date(2026, 0, 5, 23, 30); // local time, late in the day
		expect(isoDate(d)).toBe("2026-01-05");
		expect(monthTitle(d, "en-US")).toBe("2026-01 January");
	});
});
