import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { Config, apply, namespace } from "../lib/index.js";

function response() {
	return {
		statusCode: 200,
		headers: {},
		setHeader(name, value) { this.headers[name] = value; },
		end(body = "") { this.body = body; }
	};
}

/** A minimal streaming POST request for the host route's JSON parser. */
function jsonRequest(body, method = "POST") {
	const req = new EventEmitter();
	req.method = method;
	queueMicrotask(() => {
		req.emit("data", Buffer.from(JSON.stringify(body)));
		req.emit("end");
	});
	return req;
}

function host(settings, rawConfig = {}, optionalServices = {}) {
	const routes = new Map();
	const commands = new Map();
	const credentialRefs = [];
	const services = new Map(Object.entries(optionalServices));
	const ctx = {
		settings,
		fiber: optionalServices.fiber,
		get(name) { return services.get(name); },
		credentials: {
			async resolve(ref) {
				credentialRefs.push(ref);
				return { value: "test-key" };
			}
		},
		webServer: {
			register(route) {
				if (optionalServices.strictRoutes === true && routes.has(route.path)) {
					throw new Error(`duplicate route ${route.path}`);
				}
				routes.set(route.path, route);
				return () => routes.delete(route.path);
			},
			tapIndex() { return () => {}; }
		},
		commands: {
			register(command) { commands.set(command.name, command); return () => commands.delete(command.name); }
		},
		on() { return () => {}; },
		effect(run) {
			return typeof optionalServices.effect === "function" ? optionalServices.effect(run) : run();
		},
		logger: { warn() {}, error() {} }
	};
	apply(ctx, rawConfig);
	return { ctx, routes, commands, credentialRefs };
}

function mockGateway(t, calls) {
	t.mock.method(globalThis, "fetch", async (url) => {
		calls.push(String(url));
		return {
			ok: true,
			status: 200,
			async json() {
				return { usage: { rolling: { percent: 12, status: "ok" } } };
			},
			async text() { return ""; }
		};
	});
}

test("DSH 0.1.6 keeps register/get settings behavior", async (t) => {
	const calls = [];
	mockGateway(t, calls);
	const rawConfig = { baseUrl: "https://base.example/go" };
	const stored = Config({
		apiKeyEnv: "OLD_KEY",
		baseUrl: "https://old.example/go",
		cacheMs: 30_000,
		updateCheck: false,
		injectSessionHeader: false,
		rollingWindowLabel: "5h"
	});
	let registration;
	const settings = {
		register(ns, schema, options) { registration = { ns, schema, options }; },
		get(ns) {
			if (ns === namespace) return stored;
			if (ns === "locale") return { preference: "en" };
			return undefined;
		}
	};
	const { routes, commands, credentialRefs } = host(settings, rawConfig);
	assert.equal(registration.ns, namespace);
	assert.equal(registration.schema, Config);
	assert.deepEqual(registration.options.base, rawConfig);

	const res = response();
	await routes.get("/opencode-go/usage").handler({ method: "GET" }, res);
	assert.equal(res.statusCode, 200);
	assert.ok(calls.includes("https://old.example/go/v1/usage"));
	assert.deepEqual(credentialRefs, ["OLD_KEY"]);
	assert.match((await commands.get("opencode-go").handler()).text, /plan usage/i);
});

test("DSH 0.1.7 reads active Loader entries without scanning every Settings schema", async (t) => {
	const calls = [];
	mockGateway(t, calls);
	let describeCalls = 0;
	const settings = {
		describe() {
			describeCalls++;
			throw new Error("an unrelated plugin schema is malformed");
		}
	};
	const ref = (value) => ({ get: () => value });
	const configEditor = {
		entries() {
			return [
				{ options: { id: "locale" }, fiber: { config: { preference: ref("en") } } },
				{ options: { id: "llm-pi-ai" }, fiber: { config: { providers: ref({}) } } }
			];
		}
	};
	const { routes, commands, credentialRefs } = host(settings, {
		apiKeyEnv: "NEW_KEY",
		baseUrl: "https://new.example/go",
		cacheMs: 30_000,
		updateCheck: false,
		injectSessionHeader: false,
		rollingWindowLabel: "6h"
	}, { configEditor });

	const res = response();
	await routes.get("/opencode-go/usage").handler({ method: "GET" }, res);
	assert.equal(res.statusCode, 200);
	assert.ok(calls.includes("https://new.example/go/v1/usage"));
	assert.deepEqual(credentialRefs, ["NEW_KEY"]);
	assert.equal(JSON.parse(res.body).labels.rollingWindow, "6h");
	assert.match((await commands.get("opencode-go").handler()).text, /plan usage/i);
	assert.equal(describeCalls, 0, "an unrelated Settings schema cannot stop this plugin from mounting");
});

test("Usage configuration card writes through legacy Settings", async (t) => {
	const calls = [];
	mockGateway(t, calls);
	const stored = Config({
		apiKeyEnv: "OLD_KEY",
		baseUrl: "https://old.example/go",
		cacheMs: 30_000,
		updateCheck: false,
		injectSessionHeader: true,
		rollingWindowLabel: "5h"
	});
	const updates = [];
	const settings = {
		register() {},
		get(ns) { return ns === namespace ? stored : undefined; },
		async update(ns, patch) {
			updates.push({ ns, patch });
			Object.assign(stored, patch);
		}
	};
	const { routes } = host(settings, {});
	const configRoute = routes.get("/dsh-opencode-go-usage/config");

	const before = response();
	await configRoute.handler({ method: "GET" }, before);
	assert.equal(JSON.parse(before.body).apiKeyEnv, "OLD_KEY");

	const after = response();
	await configRoute.handler(jsonRequest({
		apiKeyEnv: "NEW_KEY",
		baseUrl: "https://new.example/go/",
		cacheMs: 0,
		updateCheck: true,
		injectSessionHeader: false,
		rollingWindowLabel: "6h"
	}), after);
	assert.deepEqual(updates, [{
		ns: namespace,
		patch: {
			apiKeyEnv: "NEW_KEY",
			baseUrl: "https://new.example/go",
			cacheMs: 0,
			updateCheck: true,
			injectSessionHeader: false,
			rollingWindowLabel: "6h"
		}
	}]);
	assert.deepEqual(JSON.parse(after.body), {
		ok: true,
		apiKeyEnv: "NEW_KEY",
		baseUrl: "https://new.example/go",
		cacheMs: 0,
		updateCheck: true,
		injectSessionHeader: false,
		rollingWindowLabel: "6h",
		keyConfigured: true
	});
});

test("Usage configuration card writes ordinary Loader Config on DSH 0.1.7", async (t) => {
	const calls = [];
	mockGateway(t, calls);
	const entry = { options: { id: namespace } };
	let editEntry;
	let written;
	const configEditor = {
		async edit(candidate, mutate) {
			editEntry = candidate;
			written = mutate({
				apiKeyEnv: "CURRENT_KEY",
				baseUrl: "https://current.example/go",
				cacheMs: 30_000,
				updateCheck: true,
				injectSessionHeader: true,
				rollingWindowLabel: "5h"
			});
		}
	};
	const { routes } = host({}, {
		apiKeyEnv: "CURRENT_KEY",
		baseUrl: "https://current.example/go",
		cacheMs: 30_000,
		updateCheck: true,
		injectSessionHeader: true,
		rollingWindowLabel: "5h"
	}, { configEditor, fiber: { entry } });

	const res = response();
	await routes.get("/dsh-opencode-go-usage/config").handler(jsonRequest({
		cacheMs: 12_345,
		rollingWindowLabel: "4h"
	}), res);
	assert.equal(editEntry, entry);
	assert.deepEqual(written, {
		apiKeyEnv: "CURRENT_KEY",
		baseUrl: "https://current.example/go",
		cacheMs: 12_345,
		updateCheck: true,
		injectSessionHeader: true,
		rollingWindowLabel: "4h"
	});
	assert.equal(JSON.parse(res.body).cacheMs, 12_345);
	assert.equal(JSON.parse(res.body).rollingWindowLabel, "4h");
});

test("Usage web routes are released before HMR applies a new configuration", async (t) => {
	const calls = [];
	mockGateway(t, calls);
	const cleanups = [];
	const stored = Config({
		apiKeyEnv: "KEY",
		baseUrl: "https://current.example/go",
		cacheMs: 30_000,
		updateCheck: false,
		injectSessionHeader: false,
		rollingWindowLabel: "5h"
	});
	const settings = {
		register() {},
		get(ns) { return ns === namespace ? stored : undefined; }
	};
	const options = {
		strictRoutes: true,
		effect(run) {
			const cleanup = run();
			if (typeof cleanup === "function") cleanups.push(cleanup);
			return cleanup;
		}
	};
	const { ctx, routes } = host(settings, {}, options);
	assert.deepEqual([...routes.keys()].sort(), [
		"/dsh-opencode-go-usage/client.js",
		"/dsh-opencode-go-usage/config",
		"/opencode-go/usage"
	]);
	for (const cleanup of cleanups.reverse()) cleanup();
	assert.equal(routes.size, 0, "the old host instance must release its exact routes");
	assert.doesNotThrow(() => apply(ctx, {}), "a Loader HMR re-apply must not collide with the old routes");
});
