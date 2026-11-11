import { Notice, Plugin, TFile, TFolder, moment, normalizePath, parseYaml } from "obsidian";
import { ConfirmModal, TextPromptModal } from "./modals/common";
import { PickItemsModal } from "./modals/PickItemsModal";
import { catalogNeedsIds, errorMessage, findBlocks, normalizeBudget, normalizeCatalog, refreshItem, snapshotItem } from "./model";
import { BudgetSettingTab, BudgetSettings, DEFAULT_SETTINGS } from "./settings";
import { toYaml, updateBlock } from "./store";
import { BUDGET_LANG, Budget, CATALOG_LANG, CatalogItem } from "./types";
import { renderBudget } from "./views/BudgetView";
import { renderCatalog } from "./views/CatalogView";

export default class BudgetPlugin extends Plugin {
	settings!: BudgetSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new BudgetSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor(CATALOG_LANG, (src, el, ctx) => renderCatalog(this, src, el, ctx));
		this.registerMarkdownCodeBlockProcessor(BUDGET_LANG, (src, el, ctx) => renderBudget(this, src, el, ctx));

		this.addCommand({
			id: "open-catalog",
			name: "Open or create budget catalog",
			callback: () => void this.openCatalog(),
		});
		this.addCommand({
			id: "new-budget",
			name: "New budget",
			callback: () => this.newBudget(),
		});
		this.addCommand({
			id: "add-items",
			name: "Add items from catalog to current budget",
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) new Notice("Open a budget note first.");
				else void this.addItemsFromCatalog(file, undefined);
			},
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private catalogFile(): TFile | null {
		const f = this.app.vault.getAbstractFileByPath(normalizePath(this.settings.catalogPath));
		return f instanceof TFile ? f : null;
	}

	/** Reads the catalog, persisting ids for any hand-typed items first. */
	async loadCatalog(): Promise<CatalogItem[]> {
		const file = this.catalogFile();
		if (!file) {
			throw new Error(`No catalog at “${this.settings.catalogPath}”. Run “Open or create budget catalog” or fix the path in settings.`);
		}
		const block = findBlocks(await this.app.vault.read(file), CATALOG_LANG)[0];
		if (!block) throw new Error(`“${file.path}” has no ${CATALOG_LANG} block.`);
		const raw = parseYaml(block.body);
		if (catalogNeedsIds(raw)) {
			return (await updateBlock(this.app, file, CATALOG_LANG, block.start, normalizeCatalog, () => {})).items;
		}
		return normalizeCatalog(raw).items;
	}

	private async ensureFolder(path: string): Promise<void> {
		const folder = normalizePath(path);
		if (!folder || folder === "/" || this.app.vault.getAbstractFileByPath(folder) instanceof TFolder) return;
		await this.app.vault.createFolder(folder);
	}

	async openCatalog(): Promise<void> {
		let file = this.catalogFile();
		if (!file) {
			const path = normalizePath(this.settings.catalogPath);
			await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
			file = await this.app.vault.create(path, `# Budget catalog\n\n\`\`\`${CATALOG_LANG}\nitems: []\n\`\`\`\n`);
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private pickItems(catalog: CatalogItem[], existing: Set<string>): Promise<CatalogItem[]> {
		return PickItemsModal.pick(this.app, this.settings, catalog, existing);
	}

	newBudget(): void {
		new TextPromptModal(this.app, "New budget", moment().format("YYYY-MM MMMM"), (title) => void this.createBudget(title)).open();
	}

	private async createBudget(title: string): Promise<void> {
		try {
			const path = normalizePath(`${this.settings.budgetsFolder}/${title.replace(/[\\/:*?"<>|#^[\]]/g, "-")}.md`);
			const existingFile = this.app.vault.getAbstractFileByPath(path);
			if (existingFile instanceof TFile) {
				new Notice(`“${path}” already exists.`);
				await this.app.workspace.getLeaf(false).openFile(existingFile);
				return;
			}

			let picked: CatalogItem[] = [];
			try {
				const catalog = await this.loadCatalog();
				if (catalog.length) picked = await this.pickItems(catalog, new Set());
			} catch (e) {
				new Notice(`${errorMessage(e)} Creating an empty budget.`);
			}

			const base = this.settings.baseCurrency;
			const budget: Budget = {
				title,
				baseCurrency: base,
				rates: {},
				items: picked.map((i) => snapshotItem(i, base)),
				credits: [],
			};
			await this.ensureFolder(this.settings.budgetsFolder);
			const yaml = toYaml(budget).replace(/\s+$/, "");
			const file = await this.app.vault.create(path, `\`\`\`${BUDGET_LANG}\n${yaml}\n\`\`\`\n`);
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (e) {
			new Notice(`Couldn't create budget: ${errorMessage(e)}`);
		}
	}

	private async readBudget(file: TFile, lineStart: number | undefined): Promise<{ budget: Budget; start: number }> {
		const blocks = findBlocks(await this.app.vault.read(file), BUDGET_LANG);
		if (lineStart === undefined && blocks.length > 1) {
			throw new Error("This note has several budgets. Use “Add from catalog” in the one you want.");
		}
		const block = lineStart === undefined ? blocks[0] : blocks.find((b) => b.start === lineStart);
		if (!block) throw new Error("This note has no budget block.");
		return { budget: normalizeBudget(parseYaml(block.body), this.settings.baseCurrency), start: block.start };
	}

	async addItemsFromCatalog(file: TFile, lineStart: number | undefined): Promise<void> {
		try {
			const { budget, start } = await this.readBudget(file, lineStart);
			const catalog = await this.loadCatalog();
			const existing = new Set(budget.items.map((i) => i.sourceId ?? "").filter(Boolean));
			const picked = await this.pickItems(catalog, existing);
			if (!picked.length) return;
			await updateBlock(this.app, file, BUDGET_LANG, start, this.normalizeBudget, (b) =>
				b.items.push(...picked.map((i) => snapshotItem(i, b.baseCurrency))),
			);
		} catch (e) {
			new Notice(`Earmark: ${errorMessage(e)}`);
		}
	}

	async refreshFromCatalog(file: TFile, lineStart: number | undefined): Promise<void> {
		try {
			const { budget, start } = await this.readBudget(file, lineStart);
			const byId = new Map((await this.loadCatalog()).map((i) => [i.id, i]));
			const linked = budget.items.filter((i) => i.sourceId && byId.has(i.sourceId)).length;
			if (!linked) {
				new Notice("No items in this budget are linked to the catalog.");
				return;
			}
			new ConfirmModal(
				this.app,
				`Update ${linked} item${linked === 1 ? "" : "s"} with current catalog values (including allocated amounts)? Spending is kept.`,
				"Update",
				() =>
					void updateBlock(this.app, file, BUDGET_LANG, start, this.normalizeBudget, (b) => {
						b.items = b.items.map((i) => {
							const src = i.sourceId ? byId.get(i.sourceId) : undefined;
							return src ? refreshItem(i, src, b.baseCurrency) : i;
						});
					}).catch((e: unknown) => new Notice(`Earmark: ${errorMessage(e)}`)),
			).open();
		} catch (e) {
			new Notice(`Earmark: ${errorMessage(e)}`);
		}
	}

	private normalizeBudget = (raw: unknown) => normalizeBudget(raw, this.settings.baseCurrency);
}
