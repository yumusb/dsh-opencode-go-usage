// dsh-opencode-go-usage — browser half.
//
// Hand-authored client bundle in the DSH module-loader factory format:
// `window.__ModuleLoader__.load({ id, factory })`. The factory receives the
// module-table `require`, so only shell-externalized modules may be imported
// (react / react/jsx-runtime are in the static table). It registers a widget
// into the sidebar's `sidebar.footer.action` list slot and polls the
// same-origin proxy route owned by the host half — the GO API key never
// enters the browser. UI strings are bilingual via the DSH locale service
// (dictionaries registered under the `dsh-opencode-go-usage` namespace).
window.__ModuleLoader__.load({
	id: "dsh-opencode-go-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");

		// ── styles (injected once, same pattern as built-in client plugins) ──
		const CSS_ID = "dsh-opencode-go-usage/widget.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"" + CSS_ID + "\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-opencode-go-usage";
			tag.dataset.pluginCss = CSS_ID;
			tag.textContent = [
				".ocg-widget{box-sizing:border-box;width:100%;min-width:0;padding:6px 6px 4px;display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
				".ocg-widget:hover{background:var(--dsw-alias-interactive-bg-hover)}",
				".ocg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:600;line-height:18px}",
				".ocg-refresh{cursor:pointer;border:none;background:none;padding:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px}",
				".ocg-refresh:hover{color:var(--dsw-alias-label-primary)}",
				".ocg-row{display:flex;flex-direction:column;gap:3px;min-width:0}",
				".ocg-row-label{display:flex;justify-content:space-between;gap:8px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}",
				".ocg-row-label b{font-weight:500;color:var(--dsw-alias-label-primary)}",
				".ocg-meta{display:flex;align-items:center;gap:6px;min-width:0}",
				".ocg-meta .ocg-track{flex:1;min-width:0}",
				".ocg-meta>span{font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none}",
				".ocg-track{box-sizing:border-box;height:5px;border-radius:3px;background:var(--dsw-alias-border-l2);overflow:hidden}",
				".ocg-fill{height:100%;border-radius:3px;transition:width .4s ease}",
				".ocg-err{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
				".ocg-rail{box-sizing:border-box;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:10px;font-weight:700;color:var(--dsw-alias-label-primary);cursor:default}",
				".ocg-rail:hover{background:var(--dsw-alias-interactive-bg-hover)}",
				".ocg-update{display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;line-height:16px;font-weight:600;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);text-decoration:none;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}",
				".ocg-config{box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:12px;margin:0;list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;color:var(--dsw-alias-label-primary)}",
				".ocg-config-title{font-size:14px;line-height:20px;font-weight:600}",
				".ocg-config-desc,.ocg-config-note,.ocg-config-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
				".ocg-config-status.ocg-config-ok{color:var(--dsw-alias-state-success-primary)}",
				".ocg-config-status.ocg-config-error{color:var(--dsw-alias-state-error-primary)}",
				".ocg-config-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}",
				".ocg-config-field{display:flex;flex-direction:column;gap:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
				".ocg-config-field input{box-sizing:border-box;width:100%;min-height:30px;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-fill-l1);color:var(--dsw-alias-label-primary);font:inherit}",
				".ocg-config-check{display:flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);cursor:pointer}",
				".ocg-config-check input{margin:0}",
				".ocg-config-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
				".ocg-config-save{min-height:30px;padding:4px 12px;border:none;border-radius:6px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font:inherit;cursor:pointer}",
				".ocg-config-save:disabled{opacity:.45;cursor:default}"
			].join("");
			document.head.appendChild(tag);
		}

		// ── locale dictionaries ──
		const NS = "dsh-opencode-go-usage";
		const zh = {
			"window.rolling": "滚动窗口",
			"window.weekly": "周窗口",
			"window.monthly": "月窗口",
			"time.soon": "即将重置",
			"time.minutes": "{n}分",
			"time.hours": "{n}小时{m}分",
			"time.days": "{n}天{m}小时",
			"status.rate-limited": "已限流",
			"refresh": "刷新",
			"loading": "加载中…",
			"rail.title": "OpenCode GO 月用量 {pct}%",
			"rail.plain": "OpenCode GO",
			"update.available": "新版本 v{v}",
			"update.title": "点击查看升级说明",
			"config.title": "OpenCode GO 用量设置",
			"config.summary": "配置 OpenCode GO 用量查询、缓存和会话请求头。",
			"config.loading": "正在读取配置…",
			"config.baseUrl": "网关地址",
			"config.apiKeyEnv": "API 密钥引用",
			"config.cacheMs": "缓存时间（毫秒）",
			"config.rollingWindow": "滚动窗口标签",
			"config.updateCheck": "检查插件更新",
			"config.injectSession": "为 OpenCode GO 请求注入会话标识",
			"config.keySet": "该凭据引用已配置密钥。",
			"config.keyUnset": "该凭据引用尚未配置密钥。",
			"config.keyHint": "密钥保存在 DSH 凭据中，不会显示或发送到浏览器。",
			"config.save": "保存设置",
			"config.saving": "保存中…",
			"config.saved": "已保存；DSH 会按正常配置重载流程应用设置。",
			"config.failed": "保存失败：{msg}"
		};
		const en = {
			"window.rolling": "Rolling",
			"window.weekly": "Weekly",
			"window.monthly": "Monthly",
			"time.soon": "resets soon",
			"time.minutes": "{n}m",
			"time.hours": "{n}h{m}m",
			"time.days": "{n}d{m}h",
			"status.rate-limited": "rate-limited",
			"refresh": "Refresh",
			"loading": "Loading…",
			"rail.title": "OpenCode GO monthly {pct}%",
			"rail.plain": "OpenCode GO",
			"update.available": "v{v} available",
			"update.title": "Click for upgrade instructions",
			"config.title": "OpenCode GO usage settings",
			"config.summary": "Configure OpenCode GO usage, caching, and the session request header.",
			"config.loading": "Loading configuration…",
			"config.baseUrl": "Gateway URL",
			"config.apiKeyEnv": "API-key credential reference",
			"config.cacheMs": "Cache time (milliseconds)",
			"config.rollingWindow": "Rolling-window label",
			"config.updateCheck": "Check for plugin updates",
			"config.injectSession": "Inject a session id for OpenCode GO requests",
			"config.keySet": "A key is configured for this credential reference.",
			"config.keyUnset": "No key is configured for this credential reference.",
			"config.keyHint": "The key stays in DSH Credentials; it is never shown or sent to the browser.",
			"config.save": "Save settings",
			"config.saving": "Saving…",
			"config.saved": "Saved; DSH will apply the settings through its normal reload path.",
			"config.failed": "Save failed: {msg}"
		};

		// ── data helpers ──
		// Window rows are generated from the response's own keys (with a
		// fallback label for unknown windows), so a new window the gateway adds
		// shows up without a plugin release. The rolling window's length label
		// comes from the host (`labels.rollingWindow`, user-configurable) — the
		// gateway does not expose its configured window length, so it is not a
		// protocol constant.
		const WINDOW_LABELS = { rolling: "window.rolling", weekly: "window.weekly", monthly: "window.monthly" };
		const WINDOW_ORDER = ["rolling", "weekly", "monthly"];

		/** Short human relative time until `iso`, localized. */
		function timeUntil(iso, t) {
			const target = new Date(iso).getTime();
			if (!Number.isFinite(target)) return "";
			const diff = target - Date.now();
			if (diff <= 0) return t("time.soon");
			const mins = Math.floor(diff / 60000);
			if (mins < 60) return t("time.minutes", { n: mins });
			const hours = Math.floor(mins / 60);
			if (hours < 24) return t("time.hours", { n: hours, m: mins % 60 });
			return t("time.days", { n: Math.floor(hours / 24), m: hours % 24 });
		}

		/** Fill color by usage percent — themed alias tokens (light/dark safe). */
		function fillColor(percent) {
			if (percent >= 90) return "var(--dsw-alias-state-error-primary)";
			if (percent >= 70) return "var(--dsw-alias-state-warn-primary)";
			return "var(--dsw-alias-state-success-primary)";
		}

		/** Same-origin JSON helper for the plugin-owned configuration card. */
		function requestJson(url, init) {
			return fetch(url, { cache: "no-store", ...init })
				.then((res) => res.json().catch(() => null).then((json) => ({ res, json })))
				.catch((error) => ({
					res: { ok: false, status: 0 },
					json: { ok: false, error: String((error && error.message) || error) }
				}));
		}

		/**
		 * The configuration page is deliberately independent from the usage
		 * widget: it is rendered by either old or current Plugin Manager slots,
		 * and talks only to the host's same-origin configuration endpoint.
		 */
		function ConfigCard(props) {
			const t = (props && props.t) || ((key) => key);
			const [saved, setSaved] = react.useState(null);
			const [draft, setDraft] = react.useState(null);
			const [saving, setSaving] = react.useState(false);
			const [line, setLine] = react.useState(null);

			const applySnapshot = (json) => {
				setSaved(json);
				setDraft({
					apiKeyEnv: typeof json.apiKeyEnv === "string" ? json.apiKeyEnv : "",
					baseUrl: typeof json.baseUrl === "string" ? json.baseUrl : "",
					cacheMs: String(typeof json.cacheMs === "number" ? json.cacheMs : 30000),
					rollingWindowLabel: typeof json.rollingWindowLabel === "string" ? json.rollingWindowLabel : "5h",
					updateCheck: json.updateCheck !== false,
					injectSessionHeader: json.injectSessionHeader !== false
				});
			};

			react.useEffect(() => {
				let alive = true;
				requestJson("/dsh-opencode-go-usage/config").then(({ res, json }) => {
					if (!alive) return;
					if (json && json.ok === true) {
						applySnapshot(json);
					} else {
						setLine({ ok: false, text: t("config.failed", { msg: String((json && json.error) || "HTTP " + res.status) }) });
					}
				});
				return () => { alive = false; };
			}, []);

			const setField = (name, value) => setDraft((current) => current === null ? current : { ...current, [name]: value });
			const save = async () => {
				if (draft === null) return;
				setSaving(true);
				setLine(null);
				try {
					const cacheMs = Number(draft.cacheMs);
					const { res, json } = await requestJson("/dsh-opencode-go-usage/config", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							apiKeyEnv: draft.apiKeyEnv.trim(),
							baseUrl: draft.baseUrl.trim(),
							cacheMs,
							rollingWindowLabel: draft.rollingWindowLabel.trim(),
							updateCheck: draft.updateCheck,
							injectSessionHeader: draft.injectSessionHeader
						})
					});
					if (!json || json.ok !== true) {
						setLine({ ok: false, text: t("config.failed", { msg: String((json && json.error) || "HTTP " + res.status) }) });
						return;
					}
					applySnapshot(json);
					setLine({ ok: true, text: t("config.saved") });
				} finally {
					setSaving(false);
				}
			};

			if (draft === null) {
				return react_jsx_runtime.jsx("li", {
					className: "ocg-config",
					children: [
						react_jsx_runtime.jsx("div", { className: "ocg-config-title", children: t("config.title") }),
						react_jsx_runtime.jsx("div", { className: "ocg-config-desc", children: t("config.loading") })
					]
				});
			}

			return react_jsx_runtime.jsx("li", {
				className: "ocg-config",
				children: [
					react_jsx_runtime.jsx("div", { className: "ocg-config-title", children: t("config.title") }),
					react_jsx_runtime.jsx("div", { className: "ocg-config-desc", children: t("config.summary") }),
					react_jsx_runtime.jsx("div", {
						className: "ocg-config-grid",
						children: [
							react_jsx_runtime.jsx("label", {
								className: "ocg-config-field",
								children: [
									t("config.baseUrl"),
									react_jsx_runtime.jsx("input", {
										"aria-label": t("config.baseUrl"),
										value: draft.baseUrl,
										onChange: (event) => setField("baseUrl", event.target.value),
										disabled: saving
									})
								]
							}),
							react_jsx_runtime.jsx("label", {
								className: "ocg-config-field",
								children: [
									t("config.apiKeyEnv"),
									react_jsx_runtime.jsx("input", {
										"aria-label": t("config.apiKeyEnv"),
										value: draft.apiKeyEnv,
										onChange: (event) => setField("apiKeyEnv", event.target.value),
										disabled: saving
									})
								]
							}),
							react_jsx_runtime.jsx("label", {
								className: "ocg-config-field",
								children: [
									t("config.cacheMs"),
									react_jsx_runtime.jsx("input", {
										type: "number",
										min: 0,
										step: 1,
										"aria-label": t("config.cacheMs"),
										value: draft.cacheMs,
										onChange: (event) => setField("cacheMs", event.target.value),
										disabled: saving
									})
								]
							}),
							react_jsx_runtime.jsx("label", {
								className: "ocg-config-field",
								children: [
									t("config.rollingWindow"),
									react_jsx_runtime.jsx("input", {
										"aria-label": t("config.rollingWindow"),
										value: draft.rollingWindowLabel,
										onChange: (event) => setField("rollingWindowLabel", event.target.value),
										disabled: saving
									})
								]
							})
						]
					}),
					react_jsx_runtime.jsx("label", {
						className: "ocg-config-check",
						children: [
							react_jsx_runtime.jsx("input", {
								type: "checkbox",
								checked: draft.updateCheck,
								onChange: (event) => setField("updateCheck", event.target.checked),
								disabled: saving
							}),
							t("config.updateCheck")
						]
					}),
					react_jsx_runtime.jsx("label", {
						className: "ocg-config-check",
						children: [
							react_jsx_runtime.jsx("input", {
								type: "checkbox",
								checked: draft.injectSessionHeader,
								onChange: (event) => setField("injectSessionHeader", event.target.checked),
								disabled: saving
							}),
							t("config.injectSession")
						]
					}),
					react_jsx_runtime.jsx("div", { className: "ocg-config-note", children: saved?.keyConfigured === true ? t("config.keySet") : t("config.keyUnset") }),
					react_jsx_runtime.jsx("div", { className: "ocg-config-note", children: t("config.keyHint") }),
					react_jsx_runtime.jsx("div", {
						className: "ocg-config-actions",
						children: react_jsx_runtime.jsx("button", {
							className: "ocg-config-save",
							onClick: save,
							disabled: saving || draft.baseUrl.trim().length === 0 || draft.apiKeyEnv.trim().length === 0,
							children: saving ? t("config.saving") : t("config.save")
						})
					}),
					line ? react_jsx_runtime.jsx("div", {
						className: "ocg-config-status " + (line.ok ? "ocg-config-ok" : "ocg-config-error"),
						children: line.text
					}) : null
				]
			});
		}

		// ── widget component ──
		/**
		 * @param {{ wide?: boolean, t?: Function }} props - owner share from the
		 * sidebar (`sidebar.footer.action` is rendered with `{ wide }`) plus the
		 * locale translate seat declared by this registration.
		 */
		function Widget(props) {
			const t = props.t || ((key) => key);
			const [data, setData] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [stamp, setStamp] = react.useState(0);

			react.useEffect(() => {
				let alive = true;
				const load = async () => {
					try {
						const res = await fetch("/opencode-go/usage", { cache: "no-store" });
						const json = await res.json().catch(() => null);
						if (!alive) return;
						if (!res.ok || json === null || json.error) {
							setError(String((json && json.error) || "HTTP " + res.status));
							setData(null);
						} else {
							setData(json);
							setError(null);
						}
					} catch (e) {
						if (!alive) return;
						setError(String((e && e.message) || e));
						setData(null);
					}
				};
				load();
				const timer = window.setInterval(load, 60000);
				return () => { alive = false; window.clearInterval(timer); };
			}, [stamp]);

			const usage = data && typeof data.usage === "object" && data.usage !== null ? data.usage : null;
			const monthly = usage ? usage.monthly : null;
			const pct = monthly && typeof monthly.percent === "number" ? monthly.percent : null;
			// The rolling window's length label comes from the host config
			// (`labels.rollingWindow`, default "5h") — display-only.
			const rollingHint = data && data.labels && typeof data.labels.rollingWindow === "string" && data.labels.rollingWindow.length > 0
				? " (" + data.labels.rollingWindow + ")"
				: "";

			// Window rows: known windows in a stable order first, then any
			// unknown window the gateway added (so a new window appears without
			// a plugin release).
			const windows = [];
			if (usage !== null) {
				for (const key of WINDOW_ORDER) {
					if (typeof usage[key] === "object" && usage[key] !== null) windows.push(key);
				}
				for (const key of Object.keys(usage)) {
					if (!WINDOW_ORDER.includes(key) && typeof usage[key] === "object" && usage[key] !== null) windows.push(key);
				}
			}

			// Collapsed rail: a compact badge with the monthly percentage.
			if (!props.wide) {
				return react_jsx_runtime.jsx("div", {
					className: "ocg-rail",
					title: error ? ("OpenCode GO: " + error) : (pct === null ? t("rail.plain") : t("rail.title", { pct: pct })),
					children: pct === null ? "GO" : pct + "%"
				});
			}

			// Expanded footer widget: one progress bar per window.
			const rows = [];
			for (const key of windows) {
				const win = usage ? usage[key] : null;
				if (!win || typeof win.percent !== "number") continue;
				const label = WINDOW_LABELS[key] !== undefined ? t(WINDOW_LABELS[key]) : key;
				const statusText = win.status === "ok"
					? (win.resetsAt ? timeUntil(win.resetsAt, t) : "")
					: (typeof win.status === "string" && win.status !== "" && t("status." + win.status) !== "status." + win.status
						? t("status." + win.status)
						: win.status);
				rows.push(react_jsx_runtime.jsx("div", {
					className: "ocg-row",
					children: [
						// Name + percentage on one line (percentage right-aligned).
						// The rolling row's name carries the window-length hint.
						react_jsx_runtime.jsx("div", {
							className: "ocg-row-label",
							children: [
								react_jsx_runtime.jsx("b", { children: key === "rolling" ? label + rollingHint : label }),
								react_jsx_runtime.jsx("b", { children: win.percent + "%" })
							]
						}),
						// Track + countdown on one line (track flexes, countdown
						// right-aligned small text; status replaces it when not ok).
						react_jsx_runtime.jsx("div", {
							className: "ocg-meta",
							children: [
								react_jsx_runtime.jsx("div", {
									className: "ocg-track",
									children: react_jsx_runtime.jsx("div", {
										className: "ocg-fill",
										style: {
											width: Math.max(0, Math.min(100, win.percent)) + "%",
											background: fillColor(win.percent)
										}
									})
								}),
								react_jsx_runtime.jsx("span", { children: statusText })
							]
						})
					]
				}, key));
			}

			return react_jsx_runtime.jsx("div", {
				className: "ocg-widget",
				children: [
					react_jsx_runtime.jsx("div", {
						className: "ocg-head",
						children: [
							react_jsx_runtime.jsx("span", { children: "OpenCode GO" }),
							(data && data.update && data.update.available && data.update.latest
								? react_jsx_runtime.jsx("a", {
									className: "ocg-update",
									href: "https://www.npmjs.com/package/dsh-opencode-go-usage",
									target: "_blank",
									rel: "noreferrer",
									title: t("update.title"),
									children: t("update.available", { v: data.update.latest })
								})
								: null),
							react_jsx_runtime.jsx("button", {
								className: "ocg-refresh",
								onClick: () => setStamp((s) => s + 1),
								children: t("refresh")
							})
						]
					}),
					error ? react_jsx_runtime.jsx("div", { className: "ocg-err", children: error }) : null,
					!error && data === null ? react_jsx_runtime.jsx("div", { className: "ocg-err", children: t("loading") }) : null,
					rows.length > 0 ? react_jsx_runtime.jsx(react.Fragment, { children: rows }) : null
				]
			});
		}

		// ── cordis plugin entry ──
		const inject = ["slots", "locale"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-opencode-go-usage: dictionaries");
			const registerWidget = () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "dsh-opencode-go-usage",
				order: 0,
				label: "OpenCode GO",
				locale: NS
			}, Widget);
			if (typeof ctx.slots.inject === "function") {
				ctx.slots.inject("sidebar.footer.action", registerWidget);
			} else {
				ctx.effect(registerWidget, "dsh-opencode-go-usage: widget registration");
			}

			// DSH <= 0.1.6 used the Settings card slot, while DSH >= 0.1.7
			// renders bundle configuration through the Plugin Manager slot. Keep
			// both registrations alive: a missing slot simply stays pending, and
			// upgrading DSH cannot turn this plugin back into a read-only widget.
			const fallback = (key) => zh[key] || key;
			const bound = typeof ctx.locale.bind === "function" ? ctx.locale.bind(NS) : fallback;
			const renderConfig = (props) => {
				const translate = typeof props?.t === "function" ? props.t : bound;
				if (props?.view === "summary") return translate("config.summary");
				return ConfigCard({ ...(props || {}), t: translate });
			};
			const registerConfig = (slot, options, label) => {
				const register = () => ctx.slots.register({ name: slot, ...options }, renderConfig);
				if (typeof ctx.slots.inject === "function") {
					ctx.effect(() => ctx.slots.inject(slot, register), label);
				} else {
					ctx.effect(register, label);
				}
			};
			registerConfig("settings.plugin.item", { key: NS }, "dsh-opencode-go-usage: legacy configuration card");
			registerConfig("plugins.bundle.config", { key: NS, locale: NS }, "dsh-opencode-go-usage: bundle configuration card");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
