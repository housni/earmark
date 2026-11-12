// Renders demo.html frame by frame (deterministic seek(t)) and pipes JPEGs to ffmpeg.
// Usage: node render.mjs <demo.html> <out.mp4> [--stills t1,t2,...] [--fps 30]
// Needs Chromium (CHROME_PATH, default /usr/bin/chromium) and ffmpeg on PATH.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const [html, out, ...rest] = process.argv.slice(2);
const opt = (name, def) => {
	const i = rest.indexOf(name);
	return i >= 0 ? rest[i + 1] : def;
};
const fps = Number(opt("--fps", "30"));
const stills = opt("--stills", "");

const browser = await puppeteer.launch({
	executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
	headless: true,
	args: ["--no-sandbox", "--font-render-hinting=none", "--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
await page.goto("file://" + path.resolve(html), { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const total = await page.evaluate(() => window.TOTAL);
const clip = { x: 0, y: 0, width: 1280, height: 720 };

if (stills) {
	mkdirSync(out, { recursive: true });
	for (const t of stills.split(",").map(Number)) {
		await page.evaluate((t) => window.seek(t), t);
		await page.screenshot({ path: path.join(out, `still-${String(t).padStart(5, "0")}.png`), clip });
	}
	console.log(`stills written to ${out}`);
} else {
	const ff = spawn("ffmpeg", [
		"-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", "20", "-movflags", "+faststart", out,
	], { stdio: ["pipe", "inherit", "inherit"] });
	const frames = Math.ceil(total * fps);
	for (let f = 0; f < frames; f++) {
		// Frames are rendered in order, so the cursor's cache of target positions is warm.
		await page.evaluate((t) => window.seek(t), f / fps);
		const buf = await page.screenshot({ type: "jpeg", quality: 92, clip });
		if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
		if (f % (fps * 10) === 0) console.log(`frame ${f}/${frames}`);
	}
	ff.stdin.end();
	await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error("ffmpeg exited " + c)))));
	console.log(`wrote ${out} (${total.toFixed(1)}s, ${frames} frames)`);
}
await browser.close();
