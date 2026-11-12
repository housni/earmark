import { moment } from "obsidian";
import { DEFAULT_TITLE_FORMAT } from "./config";

// Obsidian declares `moment` as the module namespace, which TypeScript 7
// treats as not callable. At runtime it is the moment function.
type MomentFn = (date?: Date) => { format(fmt: string): string };

/** Formats with moment tokens (as in Daily Notes); empty uses the default title format. */
export function formatDate(date: Date, fmt: string): string {
	return (moment as unknown as MomentFn)(date).format(fmt.trim() || DEFAULT_TITLE_FORMAT);
}
