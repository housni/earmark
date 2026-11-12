// Pure data helpers: no Obsidian imports, so they can be unit tested.
import type {
	Budget,
	BudgetItem,
	Catalog,
	CatalogItem,
	Credit,
	ItemFields,
	ItemFilter,
	Stamps,
	Transaction,
} from "./types";

export function newId(): string {
	return Math.random().toString(36).slice(2, 8);
}

/**
 * Id for an entry typed in by hand without one. Derived from its position and
 * content so the render and the next save agree on it; the save persists it.
 */
function derivedId(kind: string, index: number, raw: unknown): string {
	const seed = `${kind}:${index}:${JSON.stringify(raw)}`;
	let h = 0x811c9dc5;
	for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
	return "h" + (h >>> 0).toString(36);
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

function list(v: unknown, field: string): unknown[] {
	if (v === undefined || v === null) return [];
	if (!Array.isArray(v)) throw new Error(`"${field}" must be a list`);
	return v;
}

function str(v: unknown): string {
	if (v === undefined || v === null) return "";
	if (v instanceof Date) return v.toISOString().slice(0, 10);
	return String(v).trim();
}

export function num(v: unknown): number {
	if (typeof v === "number") return Number.isFinite(v) ? v : 0;
	const n = parseFloat(str(v).replace(/,/g, ""));
	return Number.isFinite(n) ? n : 0;
}

/** Keeps the full ISO timestamp, including when YAML parsed it into a Date. */
function timestamp(v: unknown): string {
	if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
	return str(v);
}

function stamps(o: Obj): Stamps {
	return { created: timestamp(o.created), modified: timestamp(o.modified) };
}

export function now(): string {
	return new Date().toISOString();
}

function tags(v: unknown): string[] {
	const parts = Array.isArray(v) ? v.map(str) : str(v).split(",");
	return parts.map((t) => t.trim()).filter(Boolean);
}

function mapping(raw: unknown, what: string): Obj {
	if (raw === undefined || raw === null) return {};
	if (typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`${what} block must be a YAML mapping`);
	}
	return raw as Obj;
}

function id(o: Obj, kind: string, index: number): string {
	return str(o.id) || derivedId(kind, index, o);
}

// Normalized objects start from the raw one so keys added by hand survive a save.

function normalizeFields(o: Obj): ItemFields {
	return {
		...o,
		name: str(o.name),
		amount: num(o.amount),
		currency: str(o.currency).toUpperCase(),
		frequency: str(o.frequency),
		account: str(o.account),
		category: str(o.category),
		priority: str(o.priority),
		tags: tags(o.tags),
		description: str(o.description),
		manager: str(o.manager),
	};
}

export function normalizeCatalog(raw: unknown): Catalog {
	const o = mapping(raw, "Catalog");
	return {
		...o,
		items: list(o.items, "items").map((v, i) => {
			const item = obj(v);
			return { ...normalizeFields(item), ...stamps(item), id: id(item, "c", i) };
		}),
	};
}

/** True when some catalog items have no id yet (e.g. typed in by hand). */
export function catalogNeedsIds(raw: unknown): boolean {
	const items = obj(raw).items;
	return Array.isArray(items) && items.some((v) => !str(obj(v).id));
}

export function normalizeBudget(raw: unknown, defaultCurrency: string): Budget {
	const o = mapping(raw, "Budget");
	const baseCurrency = str(o.baseCurrency).toUpperCase() || defaultCurrency;
	const rates: Record<string, number> = {};
	for (const [cur, rate] of Object.entries(obj(o.rates))) {
		const r = num(rate);
		if (r > 0) rates[cur.toUpperCase()] = r;
	}
	const items: BudgetItem[] = list(o.items, "items").map((v, i) => {
		const item = obj(v);
		const fields = normalizeFields(item);
		const out: BudgetItem = {
			...fields,
			...stamps(item),
			id: id(item, "i", i),
			currency: fields.currency || baseCurrency,
			transactions: list(item.transactions, "transactions").map((tv, ti): Transaction => {
				const t = obj(tv);
				return { ...t, id: id(t, `t${i}`, ti), date: str(t.date), amount: num(t.amount), note: str(t.note) };
			}),
		};
		const sourceId = str(item.sourceId);
		if (sourceId) out.sourceId = sourceId;
		else delete out.sourceId;
		return out;
	});
	const credits: Credit[] = list(o.credits, "credits").map((v, i) => {
		const c = obj(v);
		return {
			...c,
			id: id(c, "r", i),
			source: str(c.source),
			amount: num(c.amount),
			currency: str(c.currency).toUpperCase() || baseCurrency,
			note: str(c.note),
		};
	});
	return { ...o, title: str(o.title), baseCurrency, rates, items, credits };
}

/** Copies a catalog item into a budget. The copy gets its own id and dates. */
export function snapshotItem(item: CatalogItem, baseCurrency: string): BudgetItem {
	const at = now();
	return {
		...item,
		id: newId(),
		created: at,
		modified: at,
		tags: [...item.tags],
		currency: item.currency || baseCurrency,
		sourceId: item.id,
		transactions: [],
	};
}

/** Re-copies catalog values onto a budget item, keeping its id, created date and spending. */
export function refreshItem(item: BudgetItem, source: CatalogItem, baseCurrency: string): BudgetItem {
	return {
		...item,
		...snapshotItem(source, baseCurrency),
		id: item.id,
		created: item.created,
		transactions: item.transactions,
	};
}

/**
 * Re-expresses rates against a new base currency. Returns null when the new
 * base has no rate against the old one, since the rates can't be converted.
 */
export function rebaseRates(
	rates: Record<string, number>,
	oldBase: string,
	newBase: string,
): Record<string, number> | null {
	if (oldBase === newBase) return { ...rates };
	const r = rates[newBase];
	if (!(r > 0)) return Object.keys(rates).length ? null : {};
	const round = (x: number) => Number(x.toPrecision(8));
	const out: Record<string, number> = { [oldBase]: round(1 / r) };
	for (const [cur, v] of Object.entries(rates)) if (cur !== newBase) out[cur] = round(v / r);
	return out;
}

export function matchesFilter(item: ItemFields, f: ItemFilter): boolean {
	if (f.category && item.category !== f.category) return false;
	if (f.account && item.account !== f.account) return false;
	if (f.tag && !item.tags.includes(f.tag)) return false;
	if (f.search) {
		const q = f.search.toLowerCase();
		const hay = [item.name, item.description, item.manager, item.category, item.account, ...item.tags]
			.join(" ")
			.toLowerCase();
		if (!hay.includes(q)) return false;
	}
	return true;
}

export type SortKey =
	| "name" | "amount" | "currency" | "frequency" | "account" | "category" | "priority" | "tags" | "manager"
	| "created" | "modified" | "spent" | "balance";

type Sortable = ItemFields & Stamps & { transactions?: Transaction[] };

function spentSum(item: Sortable): number {
	return (item.transactions ?? []).reduce((sum, t) => sum + t.amount, 0);
}

/** Sort value, or null for a blank (blanks always sort last). */
function sortValue(item: Sortable, key: SortKey, priorities: string[]): string | number | null {
	switch (key) {
		case "amount":
			return item.amount;
		case "spent":
			return spentSum(item);
		case "balance":
			return item.amount - spentSum(item);
		case "priority": {
			const i = priorities.indexOf(item.priority);
			return i < 0 ? null : i;
		}
		case "tags":
			return item.tags.join(", ") || null;
		default:
			return item[key] || null;
	}
}

/**
 * Sorted copy. Priority follows the order in settings (highest first);
 * blanks sort last in both directions; an empty key keeps the original order.
 */
export function sortItems<T extends Sortable>(items: T[], key: SortKey | "", dir: 1 | -1, priorities: string[]): T[] {
	if (!key) return [...items];
	return [...items].sort((a, b) => {
		const av = sortValue(a, key, priorities);
		const bv = sortValue(b, key, priorities);
		if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
		const c = typeof av === "number" && typeof bv === "number"
			? av - bv
			: String(av).localeCompare(String(bv), undefined, { numeric: true });
		return c * dir;
	});
}

export function distinct(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function isEmpty(v: unknown): boolean {
	return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/**
 * Plain, compact copy for serializing: drops undefined values, and drops
 * empty strings and empty lists below the top level so items stay short.
 */
export function toPlain<T>(data: T): T {
	const walk = (v: unknown, depth: number): unknown => {
		if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
		if (v instanceof Date) return v.toISOString().slice(0, 10);
		if (v && typeof v === "object") {
			const out: Obj = {};
			for (const [k, x] of Object.entries(v)) {
				if (x === undefined || (depth > 0 && isEmpty(x))) continue;
				out[k] = walk(x, depth + 1);
			}
			return out;
		}
		return v;
	};
	return walk(data, 0) as T;
}

export interface Block {
	/** Line of the opening fence. */
	start: number;
	/** Line of the closing fence. */
	end: number;
	/** Text before the fence on each line, e.g. indentation or "> " in a callout. */
	prefix: string;
	body: string;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

export function findBlocks(text: string, lang: string): Block[] {
	const lines = text.split(/\r?\n/);
	const blocks: Block[] = [];
	const open = new RegExp(`^((?:[ \\t]*>)*[ \\t]*)(\`{3,}|~{3,})[ \\t]*${escapeRegex(lang)}[ \\t]*$`);
	for (let i = 0; i < lines.length; i++) {
		const m = open.exec(lines[i]);
		if (!m) continue;
		const [, prefix, fence] = m;
		const strip = (line: string) => (line.startsWith(prefix) ? line.slice(prefix.length) : line.trimStart());
		const close = new RegExp(`^[ \\t]*${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
		let j = i + 1;
		while (j < lines.length && !close.test(strip(lines[j]))) j++;
		if (j >= lines.length) break; // unclosed block: leave it alone
		blocks.push({ start: i, end: j, prefix, body: lines.slice(i + 1, j).map(strip).join("\n") });
		i = j;
	}
	return blocks;
}

export function replaceBlockBody(text: string, block: Block, body: string): string {
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const lines = text.split(/\r?\n/);
	const trimmed = body.replace(/\s+$/, "");
	const bodyLines = trimmed ? trimmed.split("\n").map((l) => block.prefix + l) : [];
	return [...lines.slice(0, block.start + 1), ...bodyLines, ...lines.slice(block.end)].join(eol);
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local date (YYYY-MM-DD) of an ISO timestamp, or "" if it's blank or invalid. */
export function stampDate(stamp: string): string {
	const d = new Date(stamp);
	return stamp && !Number.isNaN(d.getTime()) ? isoDate(d) : "";
}

export function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
