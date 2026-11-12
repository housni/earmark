import { setIcon } from "obsidian";
import type { ColorVision } from "../config";
import { priorityTier, stampDate } from "../model";

export function iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLElement {
	const btn = parent.createEl("button", { cls: "clickable-icon budget-icon-btn", attr: { "aria-label": label } });
	setIcon(btn, icon);
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		onClick();
	});
	return btn;
}

/** Table cell showing a timestamp's local date, with the full date and time on hover. */
export function stampCell(row: HTMLElement, stamp: string): void {
	const date = stampDate(stamp);
	const td = row.createEl("td", { cls: "budget-date", text: date || "—" });
	if (date) td.title = new Date(stamp).toLocaleString();
}

/** Header cell that sorts by `key` on click, showing ▲/▼ when active. */
export function sortHeader<K extends string>(
	row: HTMLElement,
	label: string,
	key: K,
	state: { sortKey: K | ""; sortDir: 1 | -1 },
	onSort: () => void,
	numeric = false,
	/** A third click returns to the original order. */
	allowUnsorted = false,
): void {
	const th = row.createEl("th", { cls: numeric ? "budget-num budget-sortable" : "budget-sortable" });
	th.setText(label + (state.sortKey === key ? (state.sortDir === 1 ? " ▲" : " ▼") : ""));
	th.setAttr("aria-sort", state.sortKey === key ? (state.sortDir === 1 ? "ascending" : "descending") : "none");
	th.addEventListener("click", () => {
		if (state.sortKey !== key) {
			state.sortKey = key;
			state.sortDir = 1;
		} else if (state.sortDir === 1) {
			state.sortDir = -1;
		} else if (allowUnsorted) {
			state.sortKey = "";
			state.sortDir = 1;
		} else {
			state.sortDir = 1;
		}
		onSort();
	});
}

const CVD_CLASSES = ["budget-cvd", "budget-cvd-redgreen", "budget-cvd-blueyellow", "budget-cvd-mono"];

/**
 * Sets an Earmark root element's colour vision classes. Any mode but
 * "standard" swaps the palette (styles.css) and turns on shapes and labels.
 */
export function applyColorVision(el: HTMLElement, mode: ColorVision): void {
	el.removeClass(...CVD_CLASSES);
	if (mode !== "standard") el.addClass("budget-cvd", `budget-cvd-${mode}`);
}

/** Priority label, coloured by its tier (top, middle or bottom third of the priorities list). */
export function priorityBadge(parent: HTMLElement, priority: string, priorities: string[]): HTMLElement {
	const tier = priorityTier(priority, priorities);
	return parent.createSpan({
		cls: ["budget-badge", "budget-priority", ...(tier ? [`is-${tier}`] : [])],
		text: priority,
		attr: tier ? { "aria-label": `${priority} (${tier} priority)` } : {},
	});
}
