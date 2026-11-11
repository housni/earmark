import { App, TFile, parseYaml, stringifyYaml } from "obsidian";
import { findBlocks, replaceBlockBody, toPlain } from "./model";

export function toYaml(data: unknown): string {
	return stringifyYaml(toPlain(data));
}

/**
 * Re-reads a fenced block from the file, applies `mutate` and writes it back.
 * `lineStart` is the opening fence line from getSectionInfo; when unknown, the
 * note must contain exactly one block of this kind. Throws (and writes
 * nothing) if the block can't be found or its YAML doesn't parse.
 */
export async function updateBlock<T>(
	app: App,
	file: TFile,
	lang: string,
	lineStart: number | undefined,
	normalize: (raw: unknown) => T,
	mutate: (data: T) => void,
): Promise<T> {
	let result: T | undefined;
	await app.vault.process(file, (text) => {
		const blocks = findBlocks(text, lang);
		const block =
			lineStart === undefined
				? blocks.length === 1
					? blocks[0]
					: undefined
				: blocks.find((b) => b.start === lineStart);
		if (!block) throw new Error("Couldn't find the block to update. The note may have changed; try again.");
		const data = normalize(parseYaml(block.body));
		mutate(data);
		result = data;
		return replaceBlockBody(text, block, toYaml(data));
	});
	return result as T;
}

export function renderError(el: HTMLElement, err: unknown, source: string): void {
	const box = el.createDiv({ cls: "budget-plugin budget-error" });
	box.createEl("strong", { text: "Couldn't read this block" });
	box.createEl("p", { text: err instanceof Error ? err.message : String(err) });
	box.createEl("pre", { text: source });
}
