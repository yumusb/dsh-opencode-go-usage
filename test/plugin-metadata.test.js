import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("package publishes DSH-localized Usage metadata", async () => {
	const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
	const en = JSON.parse(await readFile(new URL("../locale/en.json", import.meta.url), "utf8"));
	const zh = JSON.parse(await readFile(new URL("../locale/zh.json", import.meta.url), "utf8"));
	const icon = await readFile(new URL("../assets/opencode-go-usage.svg", import.meta.url), "utf8");
	const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
	const readmeZh = await readFile(new URL("../README.zh.md", import.meta.url), "utf8");

	// Current DSH resolves this resource before loading the plugin. Older DSH
	// ignores it and keeps package.json's English description as its fallback.
	assert.equal(manifest.exports["./locale/*.json"], "./locale/*.json");
	assert.ok(manifest.files.includes("locale/*.json"));
	assert.equal(manifest.icon, "assets/opencode-go-usage.svg");
	assert.ok(manifest.files.includes("assets/*.svg"));
	assert.match(icon, /^<svg\b/);
	assert.ok(Buffer.byteLength(icon, "utf8") <= 256 * 1024);
	assert.equal(manifest.version, "1.4.0");
	assert.equal(typeof manifest.description, "string");
	assert.equal(en.meta.title, "OpenCode GO Usage");
	assert.equal(zh.meta.description, "在侧边栏显示 OpenCode GO 套餐额度，安全代理用量查询，并提供 /opencode-go 命令。");
	assert.match(import.meta.resolve("dsh-opencode-go-usage/locale/zh.json"), /locale\/zh\.json$/);
	assert.match(readme, /## DSH compatibility/);
	assert.match(readme, /`0\.1\.1-rc\.2`/);
	assert.match(readme, /`0\.1\.7-alpha\.1`/);
	assert.match(readmeZh, /## DSH 兼容性/);
});
