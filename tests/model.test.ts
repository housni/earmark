import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { DEFAULT_SETTINGS, catalogPathOf, cleanFolder, cleanNoteName, migrateSettings, sortedList } from "../src/config";
import {
	activeFilterCount,
	catalogNeedsIds,
	emptyFilter,
	isFiltered,
	itemStatus,
	findBlocks,
	isoDate,
	matchesFilter,
	normalizeBudget,
	normalizeCatalog,
	priorityTier,
	rebaseRates,
	refreshItem,
	replaceBlockBody,
	snapshotItem,
	sortItems,
	stampDate,
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
		expect(matchesFilter(rent, { ...emptyFilter(), category: "Housing", tag: "fixed" })).toBe(true);
		expect(matchesFilter(rent, { ...emptyFilter(), search: "ren" })).toBe(true);
		expect(matchesFilter(rent, { ...emptyFilter(), category: "Pet" })).toBe(false);
	});
});

describe("dates", () => {
	it("formats local calendar dates", () => {
		const d = new Date(2026, 0, 5, 23, 30); // local time, late in the day
		expect(isoDate(d)).toBe("2026-01-05");
	});
});

describe("settings migration", () => {
	it("sorts saved categories, accounts and managers once (v2), leaving ordered lists alone", () => {
		const { settings, changed } = migrateSettings({
			settingsVersion: 1,
			categories: ["Housing", "Other", "food", "Pet"],
			accounts: ["Zed", "Common"],
			managers: ["bo", "Al"],
			priorities: ["Low", "High"],
			frequencies: ["Yearly", "Monthly"],
		});
		expect(settings.categories).toEqual(["food", "Housing", "Pet", "Other"]);
		expect(settings.accounts).toEqual(["Common", "Zed"]);
		expect(settings.managers).toEqual(["Al", "bo"]);
		expect(settings.priorities).toEqual(["Low", "High"]);
		expect(settings.frequencies).toEqual(["Yearly", "Monthly"]);
		expect(changed).toBe(true);
	});

	it("swaps untouched old default lists for the new defaults (v3)", () => {
		// Exactly what an install saved before #12, already sorted by v2.
		const { settings, changed } = migrateSettings({
			settingsVersion: 2,
			categories: ["Food", "Health", "Housing", "Immigration", "Pet", "Transport", "Utilities", "Other"],
			accounts: ["Common", "Housni"],
			managers: ["housni"],
			baseCurrency: "KES",
			colorVision: "mono",
		});
		expect(settings.categories).toEqual(DEFAULT_SETTINGS.categories);
		expect(settings.accounts).toEqual(["Common", "Jane", "John"]);
		expect(settings.managers).toEqual(["Jane", "John"]);
		expect(settings.baseCurrency).toBe("KES");
		expect(settings.colorVision).toBe("mono");
		expect(changed).toBe(true);
	});

	it("keeps customised lists, even close to an old default", () => {
		const { settings } = migrateSettings({
			settingsVersion: 2,
			categories: ["Food", "Health", "Housing", "Immigration", "Pet", "Transport", "Utilities", "Other", "Books"],
			accounts: ["Common", "Housni", "Savings"],
			managers: ["Housni", "Amina"],
		});
		expect(settings.categories).toContain("Books");
		expect(settings.categories).toContain("Immigration");
		expect(settings.accounts).toEqual(["Common", "Housni", "Savings"]);
		expect(settings.managers).toEqual(["Housni", "Amina"]);
	});

	it("upgrades the very first defaults from before v1 too", () => {
		const { settings } = migrateSettings({ accounts: ["Housni", "Nyambu", "Common"], managers: ["Housni", "Nyambu"] });
		expect(settings.accounts).toEqual(["Common", "Jane", "John"]);
		expect(settings.managers).toEqual(["Jane", "John"]);
	});

	it("ships default lists that are already in order", () => {
		for (const key of ["categories", "accounts", "managers"] as const) {
			expect(DEFAULT_SETTINGS[key]).toEqual(sortedList(DEFAULT_SETTINGS[key]));
		}
		expect(DEFAULT_SETTINGS.categories.at(-1)).toBe("Other");
	});

	it("uses defaults for a fresh install without saving", () => {
		const { settings, changed } = migrateSettings(null);
		expect(settings.currencies).toEqual(["USD", "EUR", "GBP", "KES", "LKR"]);
		expect(changed).toBe(false);
	});

	it("adds KES and LKR once to saved lists from before v1", () => {
		const { settings, changed } = migrateSettings({ currencies: ["USD", "LKR"], baseCurrency: "LKR" });
		expect(settings.currencies).toEqual(["USD", "LKR", "KES"]);
		expect(settings.baseCurrency).toBe("LKR");
		expect(settings.settingsVersion).toBe(4);
		expect(changed).toBe(true);
	});

	it("respects removals made after migrating", () => {
		const { settings, changed } = migrateSettings({ settingsVersion: 4, currencies: ["USD"] });
		expect(settings.currencies).toEqual(["USD"]);
		expect(changed).toBe(false);
	});
});

describe("created and modified dates", () => {
	it("keeps full timestamps, including ones YAML parsed into Dates", () => {
		const stamp = "2026-11-12T13:40:00.000Z";
		const fromString = normalizeCatalog(parse(`items:\n  - { id: a, name: A, created: "${stamp}" }`));
		const fromDate = normalizeCatalog(parse(`items:\n  - { id: a, name: A, created: ${stamp} }`));
		expect(fromString.items[0].created).toBe(stamp);
		expect(fromDate.items[0].created).toBe(stamp);
		expect(fromDate.items[0].modified).toBe("");
		// Survives a write and re-read.
		const again = normalizeCatalog(parse(stringify(toPlain(fromDate))));
		expect(again.items[0].created).toBe(stamp);
	});

	it("gives snapshots their own dates and keeps created on refresh", () => {
		const [item] = normalizeCatalog(
			parse("items:\n  - { id: k1, name: Rent, amount: 1, created: 2020-01-01T00:00:00.000Z }"),
		).items;
		const snap = snapshotItem(item, "LKR");
		expect(snap.created).not.toBe(item.created);
		expect(snap.created).toBe(snap.modified);
		const old = { ...snap, created: "2025-01-01T00:00:00.000Z", modified: "2025-01-01T00:00:00.000Z" };
		const refreshed = refreshItem(old, item, "LKR");
		expect(refreshed.created).toBe("2025-01-01T00:00:00.000Z");
		expect(refreshed.modified > old.modified).toBe(true);
	});

	it("shows a local date, or blank for missing or invalid stamps", () => {
		expect(stampDate(new Date(2026, 10, 12, 23, 59).toISOString())).toBe("2026-11-12");
		expect(stampDate("")).toBe("");
		expect(stampDate("nonsense")).toBe("");
	});
});

describe("sortItems", () => {
	const items = normalizeBudget(
		parse(`
items:
  - { id: a, name: Rent, amount: 100, priority: Low, created: 2026-03-01T00:00:00.000Z, transactions: [{ amount: 120 }] }
  - { id: b, name: vet, amount: 20, priority: High }
  - { id: c, name: Visa 10, amount: 50, priority: Medium, created: 2026-01-01T00:00:00.000Z, transactions: [{ amount: 5 }] }
  - { id: d, name: Visa 9, amount: 50, priority: Unlisted, created: 2026-02-01T00:00:00.000Z }
`),
		"LKR",
	).items;
	const priorities = ["High", "Medium", "Low"];
	const ids = (key: Parameters<typeof sortItems>[1], dir: 1 | -1 = 1) => sortItems(items, key, dir, priorities).map((i) => i.id);

	it("keeps the original order without a key", () => {
		expect(ids("")).toEqual(["a", "b", "c", "d"]);
	});

	it("sorts text case-insensitively and numbers naturally", () => {
		expect(ids("name")).toEqual(["a", "b", "d", "c"]);
	});

	it("sorts numbers, spending and balance", () => {
		expect(ids("amount")).toEqual(["b", "c", "d", "a"]);
		expect(ids("spent", -1)).toEqual(["a", "c", "b", "d"]);
		expect(ids("balance")).toEqual(["a", "b", "c", "d"]);
	});

	it("sorts priority by settings order with unlisted last", () => {
		expect(ids("priority")).toEqual(["b", "c", "a", "d"]);
		expect(ids("priority", -1)).toEqual(["a", "c", "b", "d"]);
	});

	it("puts blank dates last in both directions", () => {
		expect(ids("created")).toEqual(["c", "d", "a", "b"]);
		expect(ids("created", -1)).toEqual(["a", "d", "c", "b"]);
	});
});

describe("filters", () => {
	const items = normalizeBudget(
		parse(`
items:
  - id: a
    name: Rent
    amount: 100
    currency: LKR
    frequency: Monthly
    account: Common
    category: Housing
    priority: High
    manager: Jane
    tags: [fixed]
    created: 2026-11-01T10:00:00.000Z
    modified: 2026-11-10T10:00:00.000Z
    transactions: [{ amount: 100 }]
  - id: b
    name: Visa
    description: Work permit renewal
    amount: 200
    currency: USD
    frequency: One-time
    account: John
    category: Other
    priority: Low
    manager: Jane
    transactions: [{ amount: 50 }]
  - { id: c, name: Vet, amount: 15, currency: LKR, category: Pet, transactions: [{ amount: 20 }] }
  - { id: d, name: Food, amount: 40, currency: LKR, category: Food }
`),
		"LKR",
	).items;
	const ids = (f: Partial<ReturnType<typeof emptyFilter>>) =>
		items.filter((i) => matchesFilter(i, { ...emptyFilter(), ...f })).map((i) => i.id);

	it("matches everything with an empty filter", () => {
		expect(ids({})).toEqual(["a", "b", "c", "d"]);
		expect(isFiltered(emptyFilter())).toBe(false);
	});

	it("filters by each choice field", () => {
		expect(ids({ frequency: "Monthly" })).toEqual(["a"]);
		expect(ids({ priority: "Low" })).toEqual(["b"]);
		expect(ids({ manager: "Jane" })).toEqual(["a", "b"]);
		expect(ids({ currency: "USD" })).toEqual(["b"]);
		expect(ids({ account: "Common", category: "Housing" })).toEqual(["a"]);
		expect(ids({ tag: "fixed" })).toEqual(["a"]);
	});

	it("searches descriptions and ignores case", () => {
		expect(ids({ search: "PERMIT" })).toEqual(["b"]);
		expect(ids({ search: "   " })).toEqual(["a", "b", "c", "d"]);
	});

	it("filters amounts inclusively, ignoring blank bounds", () => {
		expect(ids({ amountMin: "40" })).toEqual(["a", "b", "d"]);
		expect(ids({ amountMin: "15", amountMax: "100" })).toEqual(["a", "c", "d"]);
		expect(ids({ amountMax: "1,000" })).toEqual(["a", "b", "c", "d"]);
	});

	it("filters dates inclusively and excludes items without dates", () => {
		expect(ids({ createdFrom: "2026-11-01" })).toEqual(["a"]);
		expect(ids({ modifiedTo: "2026-11-09" })).toEqual([]);
		expect(ids({ modifiedFrom: "2026-11-10", modifiedTo: "2026-11-10" })).toEqual(["a"]);
	});

	it("filters by spending status", () => {
		expect(items.map(itemStatus)).toEqual(["spent", "in-progress", "over", "not-started"]);
		expect(ids({ status: "over" })).toEqual(["c"]);
		expect(ids({ status: "not-started" })).toEqual(["d"]);
	});

	it("counts active filters without the search text", () => {
		expect(activeFilterCount({ ...emptyFilter(), search: "x", category: "Pet", amountMin: "1" })).toBe(2);
		expect(isFiltered({ ...emptyFilter(), search: "x" })).toBe(true);
	});
});

describe("priorityTier", () => {
	it("maps the default three levels directly", () => {
		expect(["High", "Medium", "Low"].map((p) => priorityTier(p, ["High", "Medium", "Low"]))).toEqual(["high", "medium", "low"]);
	});

	it("splits longer and shorter lists into thirds", () => {
		const five = ["P1", "P2", "P3", "P4", "P5"];
		expect(five.map((p) => priorityTier(p, five))).toEqual(["high", "high", "medium", "low", "low"]);
		expect(["A", "B"].map((p) => priorityTier(p, ["A", "B"]))).toEqual(["high", "low"]);
		expect(priorityTier("Only", ["Only"])).toBe("high");
	});

	it("has no tier for unlisted or blank priorities", () => {
		expect(priorityTier("Urgent", ["High", "Low"])).toBeNull();
		expect(priorityTier("", ["High", "Low"])).toBeNull();
	});
});

describe("sortedList", () => {
	it("sorts A–Z ignoring case, with Other last", () => {
		expect(sortedList(["Pet", "other", "Charity/Donation", "food", "Debts"])).toEqual([
			"Charity/Donation", "Debts", "food", "Pet", "other",
		]);
	});

	it("trims, drops blanks and case-insensitive duplicates", () => {
		expect(sortedList([" John ", "", "jane", "John", "JANE", "  "])).toEqual(["jane", "John"]);
	});
});

describe("catalog location", () => {
	it("defaults to Earmark/Catalog.md for new installs", () => {
		expect(catalogPathOf(migrateSettings(null).settings)).toBe("Earmark/Catalog.md");
	});

	it("builds the path from folder and name, tolerating stray slashes and .md", () => {
		expect(catalogPathOf({ folder: "/Money/Earmark/", catalogName: "My catalog.md" })).toBe("Money/Earmark/My catalog.md");
		expect(catalogPathOf({ folder: "", catalogName: "Catalog" })).toBe("Catalog.md");
		expect(catalogPathOf({ folder: "Earmark", catalogName: "  " })).toBe("Earmark/Catalog.md");
		expect(cleanFolder(" /a/b/ ")).toBe("a/b");
		expect(cleanNoteName("Earmark/Catalog.md")).toBe("Catalog");
	});

	it("keeps existing installs pointing at their catalog (v4)", () => {
		// The settings this vault saved before #12's comment.
		const { settings, changed } = migrateSettings({
			settingsVersion: 3,
			catalogPath: "Budgets/_Catalog.md",
			budgetsFolder: "Budgets",
		} as never);
		expect(settings.folder).toBe("Budgets");
		expect(settings.catalogName).toBe("_Catalog");
		expect(catalogPathOf(settings)).toBe("Budgets/_Catalog.md");
		expect(settings).not.toHaveProperty("catalogPath");
		expect(settings).not.toHaveProperty("budgetsFolder");
		expect(changed).toBe(true);
	});

	it("follows the catalog when it lived outside the budgets folder", () => {
		const moved = migrateSettings({ settingsVersion: 3, catalogPath: "Finance/Items.md", budgetsFolder: "Budgets" } as never);
		expect(catalogPathOf(moved.settings)).toBe("Finance/Items.md");
		expect(moved.settings.folder).toBe("Finance");
		const atRoot = migrateSettings({ settingsVersion: 3, catalogPath: "Catalog.md", budgetsFolder: "" } as never);
		expect(catalogPathOf(atRoot.settings)).toBe("Catalog.md");
	});
});
