// @ts-check
/**
 * dsh-opencode-go-usage — host half.
 *
 * Watches your OpenCode GO plan quota through the official gateway endpoint
 * (`https://opencode.ai/zen/go/v1/usage`). Proxied through a same-origin route
 * so the browser widget never sees your API key and no CORS is involved.
 *
 * - `GET /opencode-go/usage` — quota proxy (rolling / weekly / monthly window
 *   percentages from the official API).
 * - `/opencode-go` chat command — prints the same numbers as text.
 * - Browser bundle self-hosted at `/dsh-opencode-go-usage/client.js` with its boot
 *   graph row injected through the official `webServer.tapIndex` API, so the
 *   sidebar widget works from any installation location.
 *
 * Installation / configuration (official DSH flows):
 *   - Install: `dsh plugin --profile web add dsh-opencode-go-usage` — the
 *     `dsh.bundle.patch` declaration makes the CLI reconcile this package into
 *     the profile's bundle layer stack automatically (no manual patch edits).
 *   - Configure: the `dsh-opencode-go-usage` settings namespace (Web Settings →
 *     Plugins → Plugin configuration, or `~/.dsh/settings.yaml`). The API key
 *     itself lives in the credentials domain (`OPENCODE_GO_API_KEY`), never in
 *     settings.
 *
 * Settings namespace `dsh-opencode-go-usage`:
 *   - apiKeyEnv:    credential ref / env var for the API key (default OPENCODE_GO_API_KEY)
 *   - baseUrl:      GO gateway base (default https://opencode.ai/zen/go)
 *   - cacheMs:      host-side cache TTL (default 30000)
 *   - updateCheck:  check npm for newer versions (default true); result shows
 *                   in the widget and the command — the plugin never installs
 *                   itself, upgrading stays an explicit user action.
 *   - injectSessionHeader: runtime `x-opencode-session` fix (default true);
 *                   the GO gateway 400s chat requests without it. The gateway
 *                   base is read from the called provider's own settings, so
 *                   no host names are hard-coded.
 *   - rollingWindowLabel: label shown next to the rolling window (default
 *                   "5h"). The gateway does not expose its configured rolling
 *                   window length, so this stays a display-only setting — it
 *                   changes nothing about the numbers the gateway reports.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { patchFetch, unpatchFetch, recordStream, sessionDiag, sessionHeaderCount, withSession } from "./opencode-session.js";

export const name = "dsh-opencode-go-usage";

/** Required services: web routes, chat commands, credentials, settings. */
export const inject = ["webServer", "commands", "credentials", "settings"];

/** Settings namespace owned by this plugin. */
export const namespace = "dsh-opencode-go-usage";

/**
 * Turn Loader Config's stable references into ordinary JSON-shaped values.
 * DSH >= 0.1.7 uses references for volatile fields, including locale and
 * llm-pi-ai's provider dictionary.
 *
 * @param {any} value
 * @returns {any}
 */
function plainConfigValue(value) {
	if (value !== null && typeof value === "object" && typeof value.get === "function") {
		return plainConfigValue(value.get());
	}
	if (Array.isArray(value)) return value.map(plainConfigValue);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plainConfigValue(child)]));
	}
	return value;
}

/**
 * Read another plugin's effective configuration across both DSH settings
 * generations. DSH <= 0.1.6 exposes namespace values through `get()`.
 * DSH >= 0.1.7 exposes active Loader entries through ConfigEditor.
 *
 * Do not call SettingsForms.describe() here: it scans every installed schema,
 * so a third-party schema error can prevent this otherwise independent plugin
 * from mounting its route. Reading the one active Loader entry is both narrower
 * and the native configuration source on current DSH.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} ns
 * @returns {any}
 */
function settingsValue(ctx, ns) {
	try {
		if (typeof ctx.settings.get === "function") return ctx.settings.get(ns);
		const editor = ctx.get("configEditor");
		const entry = typeof editor?.entries === "function"
			? editor.entries().find((candidate) => candidate.options?.id === ns)
			: undefined;
		return entry?.fiber?.config === undefined ? undefined : plainConfigValue(entry.fiber.config);
	} catch {
		// Locale and a sibling provider configuration are optional enrichment;
		// never let a failed optional read block usage routing.
		return undefined;
	}
}

const DEFAULT_BASE_URL = "https://opencode.ai/zen/go";
const DEFAULT_API_KEY_ENV = "OPENCODE_GO_API_KEY";
const DEFAULT_CACHE_MS = 30_000;
/** npm package name this plugin is published under (update checks). */
const NPM_PACKAGE = "dsh-opencode-go-usage";
/** How often the update check may hit the npm registry (ms). */
const UPDATE_CHECK_INTERVAL_MS = 24 * 3600_000;

/** The version this running copy was installed as (read once at load). */
const CURRENT_VERSION = readPackageVersion();

/** Read `version` from the installed package.json next to this file. */
function readPackageVersion() {
	try {
		const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
		if (typeof pkg?.version === "string") return pkg.version;
	} catch {
		// fall through
	}
	return "0.0.0";
}

/** Compare two `x.y.z` version strings; returns true when `a` is newer than `b`. */
function isNewer(a, b) {
	const pa = String(a).split("-")[0].split(".").map(Number);
	const pb = String(b).split("-")[0].split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		const na = pa[i] ?? 0;
		const nb = pb[i] ?? 0;
		if (na !== nb) return na > nb;
	}
	return false;
}

/**
 * Settings schema for this plugin's namespace.
 * `injectSessionHeader` enables the runtime `x-opencode-session` fix: the
 * gateway 400s chat-completion requests without it (see lib/opencode-session.js).
 */
export const Config = z.object({
	apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV),
	baseUrl: z.string().default(DEFAULT_BASE_URL),
	cacheMs: z.number().default(DEFAULT_CACHE_MS),
	updateCheck: z.boolean().default(true),
	injectSessionHeader: z.boolean().default(true),
	rollingWindowLabel: z.string().default("5h")
});

/**
 * Read one small JSON object from a same-origin browser-card request.
 * The browser never sends the API-key value here: it only chooses the
 * credential reference that the host resolves locally.
 *
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		/** @type {Buffer[]} */
		const chunks = [];
		let size = 0;
		let tooLarge = false;
		req.on("data", (chunk) => {
			const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			size += bytes.length;
			if (size > 64 * 1024) {
				tooLarge = true;
				return;
			}
			chunks.push(bytes);
		});
		req.on("end", () => {
			if (tooLarge) {
				reject(new Error("JSON body is too large"));
				return;
			}
			try {
				const text = Buffer.concat(chunks).toString("utf8");
				const value = text.length === 0 ? {} : JSON.parse(text);
				if (value === null || typeof value !== "object" || Array.isArray(value)) {
					throw new Error("JSON body must be an object");
				}
				resolve(value);
			} catch (error) {
				reject(error instanceof Error && error.message !== "Unexpected end of JSON input"
					? error
					: new Error("invalid JSON body"));
			}
		});
		req.on("error", reject);
	});
}

/**
 * Structured error the GO gateway returns on auth / entitlement failures
 * (`{"type":"error","error":{"type":"AuthError"|...,"message":...}}`).
 * @param {unknown} err
 * @returns {err is { kind: "auth" | "entitlement", status: number, message: string }}
 */
function isGatewayError(err) {
	return err !== null && typeof err === "object" && "kind" in err && "status" in err;
}

/**
 * Turn a non-OK gateway response into the closest local error. The gateway's
 * own body is the official contract (401 AuthError / 403 EntitlementError with
 * a `{type:"error",error:{type,message}}` envelope), so it is parsed when
 * readable and only fallen back from when it is not.
 * @param {Response} res
 * @param {(zh: boolean, key: "auth" | "entitlement" | "upstream", status: number) => string} message
 */
async function gatewayError(res, message) {
	const body = await res.text().catch(() => "");
	let gatewayMessage = body.slice(0, 300);
	try {
		const parsed = JSON.parse(body);
		if (parsed?.type === "error" && typeof parsed.error?.message === "string") gatewayMessage = parsed.error.message;
	} catch {
		// non-JSON body — keep the raw excerpt
	}
	if (res.status === 401) {
		const err = /** @type {any} */ (new Error(message(true, "auth", res.status)));
		err.kind = "auth";
		err.status = res.status;
		err.gatewayMessage = gatewayMessage;
		throw err;
	}
	if (res.status === 403) {
		const err = /** @type {any} */ (new Error(message(true, "entitlement", res.status)));
		err.kind = "entitlement";
		err.status = res.status;
		err.gatewayMessage = gatewayMessage;
		throw err;
	}
	const err = /** @type {any} */ (new Error(`${message(false, "upstream", res.status)} — ${gatewayMessage}`));
	err.kind = "upstream";
	err.status = res.status;
	throw err;
}

/**
 * Resolve the API key through the DSH credentials service
 * (process env, `$DSH_HOME/.credentials.yaml`, `.env` layers).
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} refName
 */
async function resolveApiKey(ctx, refName) {
	const hit = await ctx.credentials.resolve(refName);
	const value = hit?.value;
	return typeof value === "string" && value.length > 0 ? value : null;
}

/** Fetch the GO plan quota payload from the gateway. */
async function fetchUsage(baseUrl, apiKey, message) {
	const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/usage`, {
		headers: { Authorization: `Bearer ${apiKey}` },
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) await gatewayError(res, message);
	return await res.json();
}

/**
 * Human-friendly chat output, localized (zh | en).
 * `rollingWindowLabel` is the user's rolling-window display label (default
 * "5h") — the gateway does not expose its configured window length, so the
 * label is purely cosmetic and defaults keep the old rendering.
 * @param {unknown} data
 * @param {string} lang
 * @param {{ rollingWindowLabel?: string }} [labels]
 */
function renderUsageText(data, lang, labels = {}) {
	const zh = lang !== "en";
	const u = data?.usage;
	if (!u || typeof u !== "object") return "OpenCode GO: unexpected response shape.";
	const rolling = typeof labels.rollingWindowLabel === "string" && labels.rollingWindowLabel.length > 0
		? labels.rollingWindowLabel
		: "5h";
	const lines = [zh ? "OpenCode GO 套餐用量:" : "OpenCode GO plan usage:"];
	const defs = [
		["rolling", zh ? `滚动窗口 (${rolling})` : `Rolling (${rolling})`],
		["weekly", zh ? "周窗口" : "Weekly"],
		["monthly", zh ? "月窗口" : "Monthly"]
	];
	for (const [key, label] of defs) {
		const w = u[key];
		if (!w || typeof w.percent !== "number") continue;
		const status = w.status === "ok" ? (zh ? "正常" : "ok") : (zh && w.status === "rate-limited" ? "已限流" : w.status);
		const resets = w.resetsAt
			? (zh ? `重置于 ${new Date(w.resetsAt).toLocaleString("zh-CN")}` : `resets at ${new Date(w.resetsAt).toLocaleString("en-US")}`)
			: "";
		lines.push(`  ${label}: ${w.percent}% (${status})${resets ? `, ${resets}` : ""}`);
	}
	return lines.join("\n");
}

/** Short content hash used as the bundle revision. */
function shortHash(input) {
	return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

/**
 * Inject one graph row into the index.html boot manifest
 * (`window.__DSH_BOOT__ = [...]`), skipping when the id is already present.
 * @param {string} html
 * @param {{ id: string, url: string, rev: string, inject?: string[], immediately?: boolean }} row
 * @returns the transformed html.
 */
function injectGraphRow(html, row) {
	const marker = "window.__DSH_BOOT__ = ";
	const start = html.indexOf(marker);
	if (start === -1) return html;
	const bodyStart = start + marker.length;
	const end = html.indexOf("</script>", bodyStart);
	if (end === -1) return html;
	let graph;
	try {
		graph = JSON.parse(html.slice(bodyStart, end).trim());
	} catch {
		return html;
	}
	if (!Array.isArray(graph)) return html;
	if (graph.some((entry) => entry !== null && typeof entry === "object" && entry.id === row.id)) return html;
	graph.push(row);
	// Keep the same escaping client-modules uses so the payload cannot break
	// out of the script element.
	return html.slice(0, bodyStart) + JSON.stringify(graph).replaceAll("<", "\\u003c") + html.slice(end);
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} rawConfig - loader entry config (the old Settings `base` layer).
 */
export function apply(ctx, rawConfig = {}) {
	// DSH <= 0.1.6 owns plugin configuration in the Settings service. Newer DSH
	// projects Loader Config directly and removed register()/get(), so its
	// already-resolved loader value is authoritative. Keeping Config itself
	// non-volatile is intentional: the same package must still parse and render
	// correctly on the old Settings implementation.
	const legacySettings = typeof ctx.settings.register === "function" && typeof ctx.settings.get === "function";
	if (legacySettings) ctx.settings.register(namespace, Config, { base: rawConfig });
	let loaderConfig = legacySettings ? undefined : Config(rawConfig);
	if (!legacySettings && typeof ctx.settings.configure === "function") {
		// The browser bundle owns the editable page on current DSH. Prevent a
		// future auto-generated form from competing with it if fields later gain
		// volatile metadata for another host integration.
		ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber), "dsh-opencode-go-usage: settings presentation");
	}

	const readConfig = () => {
		const stored = legacySettings ? ctx.settings.get(namespace) ?? {} : loaderConfig;
		// DSH's own locale preference ("locale.preference": zh | en); absent
		// falls back to zh (the browser decides when the user never picked).
		const locale = settingsValue(ctx, "locale")?.preference ?? "zh";
		return {
			apiKeyEnv: stored.apiKeyEnv,
			baseUrl: stored.baseUrl,
			cacheMs: stored.cacheMs,
			updateCheck: stored.updateCheck !== false,
			injectSessionHeader: stored.injectSessionHeader !== false,
			rollingWindowLabel: stored.rollingWindowLabel,
			locale
		};
	};

	/**
	 * Persist one user-editable patch across both DSH Settings generations.
	 *
	 * The current DSH exposes ordinary Loader Config through ConfigEditor, while
	 * older releases own the namespace through Settings. The fields deliberately
	 * remain non-volatile so the old Schemastery version can still load them;
	 * ConfigEditor therefore owns writes on newer DSH and HMR applies the new
	 * loader entry in the usual way.
	 *
	 * @param {Record<string, unknown>} patch
	 * @returns {Promise<ReturnType<typeof Config>>}
	 */
	const updateOwnConfig = async (patch) => {
		if (legacySettings) {
			await ctx.settings.update(namespace, patch);
			return Config(ctx.settings.get(namespace) ?? { ...rawConfig, ...patch });
		}

		const entry = ctx.fiber?.entry;
		const editor = ctx.get("configEditor");
		if (entry !== undefined && typeof editor?.edit === "function") {
			/** @type {Record<string, unknown>|undefined} */
			let written;
			await editor.edit(entry, (raw) => {
				const base = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
				written = { ...base, ...structuredClone(patch) };
				// Fail before the editor writes, so the response never reports a
				// configuration that Loader would reject during HMR.
				Config(written);
				return written;
			});
			loaderConfig = Config(written ?? { ...loaderConfig, ...patch });
			return loaderConfig;
		}

		// A short transitional window existed while Settings had lost register()
		// but still accepted namespace updates. Keep that path for such builds.
		if (typeof ctx.settings.update === "function") {
			const ns = ctx.fiber?.entry?.options?.id ?? namespace;
			await ctx.settings.update(ns, patch);
			loaderConfig = Config(settingsValue(ctx, ns) ?? { ...loaderConfig, ...patch });
			return loaderConfig;
		}
		throw new Error("DSH has no writable configuration service for this plugin");
	};

	// Localized messages for the usage path (shared by the proxy route and the
	// chat command so both surfaces word errors the same way).
	const usageMessage = (zh, key, status) => {
		if (key === "auth") {
			return zh
				? "OpenCode GO: API key 无效或已失效(检查 credential 里的值)"
				: "OpenCode GO: API key invalid or expired (check the credential value)";
		}
		if (key === "entitlement") {
			return zh
				? "OpenCode GO: 当前账号没有有效的 GO 套餐(或订阅已过期)"
				: "OpenCode GO: no active GO plan on this account (or the subscription expired)";
		}
		return zh ? `OpenCode GO: 网关错误 (HTTP ${status})` : `OpenCode GO: gateway error (HTTP ${status})`;
	};

	// ── runtime x-opencode-session injection ───────────────────────────────
	// The GO gateway rejects chat-completion requests without
	// `x-opencode-session` (HTTP 400 MissingSessionID) and DSH's pi-ai adapter
	// never sends it. Instead of patching DSH's installed files (wiped by
	// every upgrade), wrap globalThis.fetch once and stand on the official
	// `llm/stream` waterfall to learn the per-call harness session id, so
	// every GO gateway request carries the real, per-conversation session id
	// (see lib/opencode-session.js). The gateway base is resolved from the
	// called provider's OWN settings — `llm-pi-ai.providers.<route>.baseURL` —
	// so no host names are ever hard-coded, and other providers are untouched
	// (the fetch wrapper only fires when the URL matches that call's base).
	if (readConfig().injectSessionHeader) {
		patchFetch();
		ctx.on("llm/stream", (options, next) => {
			/** @type {{ provider: string | null, hasSessionId: boolean, base: string | null, baseFrom: "settings" | "config" | null }} */
			const info = {
				provider: options.provider ?? null,
				hasSessionId: options.sessionId !== void 0,
				base: null,
				baseFrom: null
			};
			if (options.sessionId === void 0) {
				recordStream(info);
				return next();
			}
			const providers = settingsValue(ctx, "llm-pi-ai")?.providers;
			const configured = providers?.[options.provider]?.baseURL;
			const base = typeof configured === "string" && configured.length > 0 ? configured : readConfig().baseUrl;
			info.base = typeof base === "string" ? base : null;
			info.baseFrom = typeof configured === "string" && configured.length > 0 ? "settings" : "config";
			recordStream(info);
			if (typeof base !== "string" || base.length === 0) return next();
			return withSession(next(), { sessionId: String(options.sessionId), base });
		});
	}

	// ── update check (npm) ─────────────────────────────────────────────────
	// Checks the registry at most once per UPDATE_CHECK_INTERVAL_MS; failures
	// are silent. The plugin only reports — upgrading stays a user action
	// (`dsh plugin --profile web add dsh-opencode-go-usage@latest`).
	/** @type {{ at: number, latest: string | null } | null} */
	let updateState = null;
	const checkForUpdate = async (config) => {
		// The flag must actually turn the feature off: no registry request at
		// all, not just a hidden badge.
		if (config.updateCheck === false) return updateState;
		const now = Date.now();
		if (updateState !== null && now - updateState.at < UPDATE_CHECK_INTERVAL_MS) return updateState;
		/** @type {{ at: number, latest: string | null }} */
		const snapshot = { at: now, latest: null };
		try {
			const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
				signal: AbortSignal.timeout(10_000)
			});
			if (res.ok) {
				const json = await res.json();
				if (typeof json?.version === "string" && isNewer(json.version, CURRENT_VERSION)) {
					snapshot.latest = json.version;
				}
			}
		} catch {
			// offline / registry hiccup — keep the previous result, refresh later
			snapshot.at = updateState?.at ?? now;
			snapshot.latest = updateState?.latest ?? null;
		}
		updateState = snapshot;
		return snapshot;
	};
	const updateInfoOf = (config) => {
		const st = updateState;
		if (config.updateCheck === false || st === null || st.latest === null) {
			return { current: CURRENT_VERSION, available: false, latest: null };
		}
		return { current: CURRENT_VERSION, available: true, latest: st.latest };
	};

	// Kick off the first check shortly after boot (non-blocking; skipped
	// entirely when updateCheck is off).
	void checkForUpdate(readConfig()).catch(() => {});

	// Host-side cache: one in-flight promise + a TTL, so several open tabs or
	// the command never hammer the gateway. The entry carries a fingerprint of
	// the configuration *including the resolved key* (only a short digest — the
	// key itself is never stored), so a changed apiKeyEnv / baseUrl / credential
	// value invalidates immediately instead of serving stale data until the TTL
	// lapses. Auth/entitlement rejections get a short negative cache, scoped to
	// the fingerprint that was rejected — fixing the key (or baseUrl) bypasses
	// it immediately, while an unchanged bad key polled by the widget every 60s
	// does not hammer the gateway.
	/** @type {{ at: number, promise: Promise<unknown>, configHash: string } | null} */
	let quotaCache = null;
	const AUTH_NEGATIVE_CACHE_MS = 5_000;
	/** @type {{ at: number, configHash: string } | null} */
	let authFailure = null;
	const quotaOnce = () => {
		const config = readConfig();
		// Fingerprint the config first: a changed apiKeyEnv / baseUrl must
		// invalidate immediately, not after the TTL lapses. Resolving the key
		// again is a local credential lookup, cheap next to a gateway round-trip.
		const promise = (async () => {
			const key = await resolveApiKey(ctx, config.apiKeyEnv);
			const now = Date.now();
			/** Only a short digest of the key goes into the hash — never the key. */
			const configHash = shortHash(JSON.stringify([config.apiKeyEnv, config.baseUrl, key === null ? "" : shortHash(key)]));
			if (key !== null && quotaCache !== null && now - quotaCache.at < config.cacheMs && quotaCache.configHash === configHash) {
				return quotaCache.promise;
			}
			if (authFailure !== null && authFailure.configHash === configHash && now - authFailure.at < AUTH_NEGATIVE_CACHE_MS) {
				throw new Error(config.locale === "en"
					? "OpenCode GO: last gateway request was rejected (auth/entitlement); retrying in a moment"
					: "OpenCode GO: 上次网关请求被拒绝(认证/套餐),稍后自动重试");
			}
			if (key === null) {
				throw new Error(config.locale === "en"
					? `OpenCode GO: no API key (set credential ${config.apiKeyEnv})`
					: `OpenCode GO: 未配置 API key(在 credential ${config.apiKeyEnv} 中设置)`);
			}
			const inner = fetchUsage(config.baseUrl, key, usageMessage);
			quotaCache = { at: now, promise: inner, configHash };
			inner.then(
				() => { if (authFailure !== null && authFailure.configHash === configHash) authFailure = null; },
				(error) => {
					if (quotaCache?.promise === inner) quotaCache = null;
					if (isGatewayError(error) && (error.kind === "auth" || error.kind === "entitlement")) {
						authFailure = { at: Date.now(), configHash };
					}
				}
			);
			return inner;
		})();
		return promise;
	};

	const handleUsage = async (req, res) => {
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.setHeader("allow", "GET, HEAD");
			res.statusCode = 405;
			res.end(JSON.stringify({ error: "method not allowed" }));
			return;
		}
		res.setHeader("content-type", "application/json; charset=utf-8");
		res.setHeader("cache-control", "no-store");
		try {
			const config = readConfig();
			// Trigger a background refresh when the interval elapsed (never
			// block the response on the registry).
			void checkForUpdate(config).catch(() => {});
			const data = await quotaOnce();
			res.end(JSON.stringify({
				...data,
				labels: { rollingWindow: config.rollingWindowLabel },
				update: updateInfoOf(config),
				sessionHeader: { active: config.injectSessionHeader, count: sessionHeaderCount(), diag: sessionDiag() }
			}));
		} catch (error) {
			// Distinguish misconfiguration (auth/entitlement) from upstream
			// trouble so the widget can show a precise message.
			if (isGatewayError(error)) {
				res.statusCode = error.status === 401 || error.status === 403 ? error.status : 502;
			} else {
				res.statusCode = 502;
			}
			res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
		}
	};

	// ── plugin configuration card ─────────────────────────────────────────
	// New DSH renders the card from the browser half through
	// `plugins.bundle.config`; old DSH uses `settings.plugin.item`. Both cards
	// talk to this small host route, so the write remains a host-side Loader or
	// Settings operation rather than a browser-side file edit.
	const configSnapshot = async (config) => ({
		ok: true,
		apiKeyEnv: config.apiKeyEnv,
		baseUrl: config.baseUrl,
		cacheMs: config.cacheMs,
		updateCheck: config.updateCheck,
		injectSessionHeader: config.injectSessionHeader,
		rollingWindowLabel: config.rollingWindowLabel,
		keyConfigured: (await resolveApiKey(ctx, config.apiKeyEnv)) !== null
	});
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/dsh-opencode-go-usage/config",
		handler: async (req, res) => {
			res.setHeader("content-type", "application/json; charset=utf-8");
			res.setHeader("cache-control", "no-store");
			try {
				const config = readConfig();
				if (req.method === "GET") {
					res.end(JSON.stringify(await configSnapshot(config)));
					return;
				}
				if (req.method !== "POST") {
					res.statusCode = 405;
					res.setHeader("allow", "GET, POST");
					res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
					return;
				}

				const body = await readJsonBody(req);
				/** @type {Record<string, unknown>} */
				const patch = {};
				if (typeof body.apiKeyEnv === "string") {
					const value = body.apiKeyEnv.trim();
					if (value.length === 0 || value.length > 200) throw new Error("apiKeyEnv must be a non-empty credential reference");
					patch.apiKeyEnv = value;
				}
				if (typeof body.baseUrl === "string") {
					const value = body.baseUrl.trim().replace(/\/+$/, "");
					let url;
					try { url = new URL(value); } catch { throw new Error("baseUrl must be a valid http(s) URL"); }
					if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("baseUrl must use http:// or https://");
					patch.baseUrl = value;
				}
				if (typeof body.cacheMs === "number") {
					if (!Number.isInteger(body.cacheMs) || body.cacheMs < 0 || body.cacheMs > 86_400_000) {
						throw new Error("cacheMs must be an integer between 0 and 86400000");
					}
					patch.cacheMs = body.cacheMs;
				}
				if (typeof body.updateCheck === "boolean") patch.updateCheck = body.updateCheck;
				if (typeof body.injectSessionHeader === "boolean") patch.injectSessionHeader = body.injectSessionHeader;
				if (typeof body.rollingWindowLabel === "string") {
					const value = body.rollingWindowLabel.trim();
					if (value.length === 0 || value.length > 40) throw new Error("rollingWindowLabel must contain 1 to 40 characters");
					patch.rollingWindowLabel = value;
				}
				const next = Object.keys(patch).length === 0 ? config : await updateOwnConfig(patch);
				res.end(JSON.stringify(await configSnapshot(next)));
			} catch (error) {
				res.statusCode = 400;
				res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
			}
		}
	}), "dsh-opencode-go-usage: configuration route");

	// Same-origin route the browser widget polls.
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/opencode-go/usage",
		handler: handleUsage
	}), "dsh-opencode-go-usage: usage route");

	// ── self-host the browser bundle ───────────────────────────────────────
	// client-modules can only resolve packages reachable from DSH's own
	// installation; a profile-installed third-party package would lose its
	// browser half. Instead we serve the bundle ourselves and inject its boot
	// graph row through the official index-tap API, so the sidebar widget
	// works from any installation location.
	const bundlePath = new URL("./client.js", import.meta.url);
	let bundleBytes = null;
	try {
		bundleBytes = readFileSync(bundlePath);
	} catch {
		// Package installed without lib/client.js — widget unavailable; the
		// route and command above still work.
	}
	if (bundleBytes !== null) {
		const rev = shortHash(bundleBytes);
		ctx.effect(() => ctx.webServer.register({
			kind: "exact",
			path: "/dsh-opencode-go-usage/client.js",
			handler: async (_req, res) => {
				res.setHeader("content-type", "text/javascript; charset=utf-8");
				res.setHeader("cache-control", "no-cache");
				res.end(bundleBytes);
			}
		}), "dsh-opencode-go-usage: client bundle route");
		ctx.effect(() => ctx.webServer.tapIndex((html) => injectGraphRow(html, {
			id: "dsh-opencode-go-usage",
			url: `/dsh-opencode-go-usage/client.js?rev=${rev}`,
			rev,
			inject: ["@deepseek-ai/dsh-client-runtime"],
			immediately: true
		})), "dsh-opencode-go-usage: client boot graph");
	}

	// Chat command so the numbers are reachable from a conversation too.
	ctx.effect(() => ctx.commands.register({
		name: "opencode-go",
		description: "show OpenCode GO plan usage (rolling/weekly/monthly windows)",
		handler: async () => {
			try {
				const config = readConfig();
				const data = await quotaOnce();
				let text = renderUsageText(data, config.locale, { rollingWindowLabel: config.rollingWindowLabel });
				const update = updateInfoOf(config);
				if (update.available && update.latest !== null) {
					text += config.locale === "en"
						? `\n\nUpdate available: v${update.latest} — run \`dsh plugin --profile web add ${NPM_PACKAGE}@latest\` to upgrade.`
						: `\n\n发现新版本 v${update.latest} — 执行 \`dsh plugin --profile web add ${NPM_PACKAGE}@latest\` 升级。`;
				}
				return { kind: "success", text };
			} catch (error) {
				return { kind: "error", text: error instanceof Error ? error.message : String(error) };
			}
		}
	}), "dsh-opencode-go-usage: usage command");

	// Restore the fetch wrapper this plugin installed when the plugin unloads
	// (dispose / HMR). With the old symbol-only guard a reloaded module kept
	// the previous wrapper installed but detached from its state — silently
	// breaking every injection. Now the dispose re-wraps on the next apply().
	ctx.effect(() => unpatchFetch(), "dsh-opencode-go-usage: fetch wrapper");
}
