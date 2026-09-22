import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("usage client registers legacy and current DSH configuration cards", async () => {
	const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	let moduleRegistration;
	const context = {
		window: { __ModuleLoader__: { load(value) { moduleRegistration = value; } } },
		// Returning a node prevents style injection; this test audits the
		// registration graph without needing a DOM implementation.
		document: { querySelector() { return {}; } }
	};
	vm.runInNewContext(source, context);
	assert.ok(moduleRegistration);
	const plugin = moduleRegistration.factory(() => ({}));
	const injected = [];
	const registrations = [];
	plugin.apply({
		effect(run) { return run(); },
		locale: {
			register() {},
			bind() { return (key) => key; }
		},
		slots: {
			inject(name, run) { injected.push(name); return run(); },
			register(options, component) { registrations.push({ options, component }); return () => {}; }
		}
	});

	assert.deepEqual(injected, ["sidebar.footer.action", "settings.plugin.item", "plugins.bundle.config"]);
	assert.deepEqual(registrations.map(({ options }) => ({
		name: options.name,
		id: options.id,
		key: options.key,
		locale: options.locale
	})), [
		{ name: "sidebar.footer.action", id: "dsh-opencode-go-usage", key: undefined, locale: "dsh-opencode-go-usage" },
		{ name: "settings.plugin.item", id: undefined, key: "dsh-opencode-go-usage", locale: undefined },
		{ name: "plugins.bundle.config", id: undefined, key: "dsh-opencode-go-usage", locale: "dsh-opencode-go-usage" }
	]);
});
