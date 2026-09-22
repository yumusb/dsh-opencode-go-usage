// @ts-check
/**
 * dsh-opencode-go-usage — runtime `x-opencode-session` injection (host half).
 *
 * WHY: the OpenCode GO gateway rejects chat-completion requests that lack the
 * `x-opencode-session` header with HTTP 400 `{"type":"MissingSessionID"}`,
 * and DSH's `llm-pi-ai` adapter never sends it (pi-ai's session-affinity
 * headers are `session_id` / `x-client-request-id` / `x-session-affinity`, and
 * off by default). Instead of patching DSH's installed files (wiped by every
 * DSH upgrade), this module injects the header at runtime:
 *
 *   1. `patchFetch()` wraps `globalThis.fetch` once. A request gets
 *      `x-opencode-session` added only when the AsyncLocalStorage context
 *      carries a session AND the request URL starts with that call's gateway
 *      base (see 2) — the base always comes from the called provider's own
 *      settings, never from a hard-coded host list.
 *   2. `withSession()` runs a stream inside that context. Standing on DSH's
 *      official `llm/stream` waterfall event, the plugin captures the per-call
 *      `options.sessionId` (`dsh-agent-loop` fills it with `session.id`) and
 *      resolves the wire base from `llm-pi-ai.providers.<route>.baseURL`, then
 *      wraps the stream iterator so the wire fetch issued while the adapter
 *      pulls chunks sees both values. AsyncLocalStorage propagation through
 *      async-generator bodies and their await chains is verified.
 *
 * The header value is the real per-conversation harness session id — never a
 * fixed fake — and only requests to the configured gateway base of the call
 * being streamed ever receive it. No private host names live in the code.
 *
 * HMR SAFETY: every piece of state the wrapper closes over (the ALS store, the
 * counters, the native fetch) lives in a `globalThis` slot keyed by a shared
 * symbol, and the wrapper itself is tagged with a symbol. DSH's host HMR
 * re-evaluates this module on reload (it clears the ESM load cache), so
 * module-scope state would be *replaced* while the already-installed wrapper
 * kept reading the old store — every injection would silently stop working.
 * Sharing one state object across module instances keeps the wrapper valid, and
 * tagging the wrapper lets a reloaded instance detect a fetch that is no longer
 * wrapped (and re-wrap it).
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** Marks a fetch function as wrapped by this module. */
const FETCH_WRAPPED = Symbol.for("dsh-opencode-go-usage:fetch-wrapped");

/** `globalThis` slot holding the state shared by every module instance. */
const STATE = Symbol.for("dsh-opencode-go-usage:session-state");

/**
 * The process-wide state behind the injection.
 * @returns {{
 *   store: AsyncLocalStorage<{ sessionId: string, base: string }>,
 *   nativeFetch: typeof fetch | null,
 *   injectionCount: number,
 *   diag: { streamSeen: number, lastStream: null | { at: number, provider: string | null, hasSessionId: boolean, base: string | null, baseFrom: "settings" | "config" | null }, requests: number, matched: number, injected: number, missed: number, rejected: number }
 * }}
 */
function sharedState() {
	const existing = globalThis[STATE];
	if (existing !== void 0) return existing;
	const created = {
		store: new AsyncLocalStorage(),
		nativeFetch: null,
		injectionCount: 0,
		diag: {
			streamSeen: 0,
			/** @type {null | { at: number, provider: string | null, hasSessionId: boolean, base: string | null, baseFrom: "settings" | "config" | null }} */
			lastStream: null,
			requests: 0,
			matched: 0,
			injected: 0,
			missed: 0,
			rejected: 0
		}
	};
	globalThis[STATE] = created;
	return created;
}

/**
 * Count of requests where this module actually set the `x-opencode-session`
 * header (a request that already carried the header is not counted).
 * @returns {number}
 */
export function sessionHeaderCount() {
	return sharedState().injectionCount;
}

/**
 * Record one `llm/stream` observation (see the `diag` object above).
 * @param {{ provider: string | null, hasSessionId: boolean, base: string | null, baseFrom: "settings" | "config" | null }} info
 */
export function recordStream(info) {
	const st = sharedState();
	st.diag.streamSeen += 1;
	st.diag.lastStream = { at: Date.now(), ...info };
}

/**
 * Snapshot of the runtime diagnostics (safe for JSON responses).
 * Field meanings:
 *   - `streamSeen` / `lastStream`: every `llm/stream` the plugin observed.
 *   - `requests`: wire fetches issued inside a session context.
 *   - `matched`: those whose URL targeted that call's gateway base.
 *   - `injected`: matched requests that left with the header present — this
 *     counts requests that already had it too, so it can exceed
 *     {@link sessionHeaderCount}, which only counts headers this module set.
 *   - `missed`: context present but URL outside the gateway base (a different
 *     provider sharing the process, or a base mismatch).
 *   - `rejected`: matched requests the gateway answered `400 MissingSessionID`,
 *     i.e. the header was absent or not accepted — the smoking gun when the
 *     injection chain is broken.
 * @returns {{ streamSeen: number, lastStream: unknown, requests: number, matched: number, injected: number, missed: number, rejected: number }}
 */
export function sessionDiag() {
	const st = sharedState();
	return {
		...st.diag,
		injected: st.diag.injected,
		lastStream: st.diag.lastStream === null ? null : { ...st.diag.lastStream }
	};
}

/**
 * The URL a fetch input targets. `Request`/`URL` objects carry a real `url`
 * property; stringifying them would yield `[object Request]` and never match.
 * @param {RequestInfo | URL} input
 */
function requestUrl(input) {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.href;
	if (input !== null && typeof input === "object" && typeof (/** @type {Request} */ (input).url) === "string") {
		return /** @type {Request} */ (input).url;
	}
	return String(input);
}

/**
 * True when the request URL targets the given gateway base (trailing slashes
 * ignored; the base itself or `base/...` both match).
 * @param {string} url
 * @param {string} base - gateway base from provider settings, e.g.
 *   `https://opencode.ai/zen/go/v1`.
 */
function matchesBase(url, base) {
	const b = String(base ?? "").replace(/\/+$/, "");
	return b.length > 0 && (url === b || url.startsWith(b + "/"));
}

/**
 * Merge the headers a request will actually be sent with: a `Request` input
 * carries its own headers, and an `init.headers` argument overrides them (per
 * the fetch spec) — so both sources have to be folded in, or an override would
 * be silently dropped.
 * @param {RequestInfo | URL} input
 * @param {RequestInit | undefined} init
 */
function mergedHeaders(input, init) {
	const fromRequest = typeof Request !== "undefined" && input instanceof Request ? input.headers : void 0;
	const headers = new Headers(fromRequest);
	if (init?.headers !== void 0 && init.headers !== null) {
		for (const [key, value] of new Headers(/** @type {HeadersInit} */ (init.headers))) headers.set(key, value);
	}
	return headers;
}

/**
 * Wrap `globalThis.fetch` once. Requests whose URL starts with the gateway
 * base carried in the ALS context get `x-opencode-session` added (their
 * session id comes from the same context). Idempotent across HMR: the wrapper
 * is tagged, so a re-evaluated module neither double-wraps nor loses the
 * already-installed wrapper's link to the shared state.
 */
export function patchFetch() {
	const st = sharedState();
	const current = globalThis.fetch;
	if (typeof current !== "function" || current[FETCH_WRAPPED] === true) return;
	st.nativeFetch = current;
	/**
	 * @this {unknown}
	 * @param {RequestInfo | URL} input
	 * @param {RequestInit | undefined} init
	 * @returns {Promise<Response>}
	 */
	const wrapper = function sessionFetch(input, init) {
		const state = sharedState();
		const meta = state.store.getStore();
		let matched = false;
		if (meta?.sessionId !== void 0) {
			state.diag.requests += 1;
			if (matchesBase(requestUrl(input), meta.base)) {
				matched = true;
				state.diag.matched += 1;
				const headers = mergedHeaders(input, init);
				if (!headers.has("x-opencode-session")) {
					headers.set("x-opencode-session", String(meta.sessionId));
					state.injectionCount += 1;
				}
				init = { ...init, headers };
				state.diag.injected += 1;
			} else {
				state.diag.missed += 1;
			}
		}
		// st.nativeFetch was set right above when this wrapper was installed and
		// only cleared by an unpatch, which also removes this wrapper first.
		const native = /** @type {typeof fetch} */ (st.nativeFetch);
		const response = native.call(this, input, init);
		if (!matched) return response;
		// A 400 from the gateway is how a broken injection chain shows up; peek
		// at a clone so the caller's body stays untouched.
		return response.then(async (res) => {
			if (res.status === 400 && typeof res.clone === "function") {
				try {
					if ((await res.clone().text()).includes("MissingSessionID")) state.diag.rejected += 1;
				} catch {
					// unreadable body — diagnostics only, never fatal
				}
			}
			return res;
		});
	};
	wrapper[FETCH_WRAPPED] = true;
	globalThis.fetch = wrapper;
}

/**
 * Restore the fetch this module replaced (dispose / HMR). A no-op when the
 * current fetch is not this module's wrapper, so it can never clobber a
 * wrapper installed by someone else after us.
 */
export function unpatchFetch() {
	const st = sharedState();
	const current = globalThis.fetch;
	if (typeof current !== "function" || current[FETCH_WRAPPED] !== true) return;
	globalThis.fetch = st.nativeFetch ?? current;
}

/**
 * Run a stream's iteration inside the given session context, so async work
 * created while the adapter pulls chunks (including the pi-ai wire fetch)
 * resolves the context from the ALS store. Implements the async-iterator
 * protocol so `for await` and direct `.next()` both work.
 * @template T
 * @param {AsyncIterable<T>} stream
 * @param {{ sessionId: string, base: string }} meta
 * @returns {AsyncIterable<T>}
 */
export function withSession(stream, meta) {
	const store = sharedState().store;
	const iterator = stream[Symbol.asyncIterator]();
	/**
	 * @param {"next" | "return" | "throw"} method
	 * @param {unknown[]} args
	 */
	const run = (method, args) => {
		const fn = /** @type {Function | undefined} */ (iterator[method]);
		if (typeof fn !== "function") {
			return Promise.resolve(method === "throw" ? { done: true } : void 0);
		}
		return store.run(meta, () => Promise.resolve(fn.call(iterator, ...args)));
	};
	/**
	 * @param {...unknown} args
	 */
	const runNext = (...args) => run("next", args);
	/**
	 * @param {...unknown} args
	 */
	const runReturn = (...args) => run("return", args);
	/**
	 * @param {...unknown} args
	 */
	const runThrow = (...args) => run("throw", args);
	return /** @type {AsyncIterable<T>} */ (/** @type {unknown} */ ({
		[Symbol.asyncIterator]() { return this; },
		next: runNext,
		return: runReturn,
		throw: runThrow
	}));
}
