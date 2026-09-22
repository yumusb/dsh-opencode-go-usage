# dsh-opencode-go-usage

English | [中文](README.zh.md)

> ⚡ Get an **OpenCode GO plan**: [buycodingplan.com](https://buycodingplan.com/)

A [DSH](https://github.com/deepseek-ai/deepseek-harness) (DeepSeek Harness) plugin that watches your **OpenCode GO plan** quota — the $10/month subscription that gives you usage limits on open-source models (rolling 5-hour, weekly, and monthly windows).

## DSH compatibility

One package covers the old and current DSH settings APIs. It detects the host
at runtime; users do not need a different package merely because their DSH is
older.

| DSH host | Supported / verified baseline | Available surface |
|---|---|---|
| Early legacy UI | `0.1.1-rc.2`, `0.1.2-alpha.2` | Sidebar widget, same-origin usage proxy, chat command, and the legacy slot-loading path. Configure through `settings.yaml` when that host has no plugin card. |
| Legacy Settings | `0.1.6-alpha.1` | Uses `settings.register()` / `get()` / `update()` and the legacy `settings.plugin.item` configuration card. |
| Loader Config | `0.1.7-alpha.1` | Uses the Loader entry and `configEditor`, renders `plugins.bundle.config`, and releases web routes safely during HMR. |

The schema intentionally remains non-volatile, so old Schemastery versions can
load it. Later `0.1.x` hosts use the Loader Config path when they retain that
interface. English and Chinese Plugin Manager metadata are bundled too; older
hosts safely fall back to the English `package.json` description.

## Features

- **Sidebar widget** — a live widget pinned at the bottom of the DSH web sidebar (`sidebar.footer.action` slot) showing three usage bars: rolling (5h), weekly, and monthly, each with a relative countdown to its window reset. When the sidebar is collapsed it shrinks to a compact percentage badge.
- **`/opencode-go` chat command** — prints the same numbers as text inside any conversation.
- **Same-origin proxy** — the host registers `GET /opencode-go/usage`, forwards to the official GO gateway with your API key. The key never reaches the browser and no CORS is involved.
- **`x-opencode-session` fix** — at runtime, injects the real harness session id into OpenCode GO gateway chat requests (the gateway 400s requests without it). No DSH file patching; survives upgrades.
- **Configuration card** — edit the gateway, credential reference, cache, update check, session-header fix and rolling-window label in either DSH settings generation.

## The `x-opencode-session` fix

The GO gateway rejects chat-completion requests that lack the `x-opencode-session` header (`HTTP 400 MissingSessionID`), and DSH's `llm-pi-ai` adapter never sends it. Instead of patching DSH's installed files (which every DSH upgrade overwrites), this plugin:

- wraps `globalThis.fetch` once, and
- listens to DSH's official `llm/stream` waterfall event to capture the per-call harness session id (`options.sessionId`, filled by `dsh-agent-loop`).

The gateway base is resolved from the **called provider's own settings** (`llm-pi-ai.providers.<route>.baseURL`, falling back to this plugin's `baseUrl`) — no host names are hard-coded — so only requests to that call's gateway receive the header, with the real per-conversation session id.

- Toggle: `injectSessionHeader` in the settings namespace (default `true`).
- Observability: `GET /opencode-go/usage` returns `sessionHeader: { active, count, diag }`; `diag` reports what the runtime saw, e.g. `streamSeen` (handled `llm/stream` calls), `lastStream` (provider, session-id presence, base and its source), `requests`/`injected`/`missed` (wire fetches that carried the context, got the header, or fell through on a URL mismatch).

## How it works

The plugin is a **dual-half DSH package**:

| half | file | role |
|---|---|---|
| host (Node) | `lib/index.js` | registers the `/opencode-go/usage` web route (`ctx.webServer`) and the `/opencode-go` command (`ctx.commands`); resolves the key through DSH credentials; caches the upstream call (30 s) |
| browser | `lib/client.js` | a hand-authored `window.__ModuleLoader__.load({ id, factory })` bundle that waits for and registers into the `sidebar.footer.action` list slot, then polls the same-origin route every 60 s |

`package.json` declares `"dsh": { "client": { "platform": "web" } }`, so DSH's client-modules node half scans it into the browser boot graph (`window.__DSH_BOOT__`) and serves the bundle at `/plugins/dsh-opencode-go-usage/client.js`.

### How the sidebar widget loads under the official install

`dsh plugin add` installs the package into the profile, which satisfies the host
half (routes, command, settings). DSH's client-modules scanner can only resolve
browser bundles from its own installation directory, so a profile-installed
third-party package would normally lose its browser half — this plugin avoids
that by **self-hosting** its bundle: the host registers the
`/dsh-opencode-go-usage/client.js` route and injects its boot-graph row through the
official `webServer.tapIndex` API. The sidebar widget therefore works from any
installation location.

## Requirements

- DSH installed and the `web` profile booted at least once (`~/.dsh/profiles/web` exists)
- Node.js ≥ 18 (for `fetch`)
- An OpenCode GO subscription and its API key

## Install (official DSH flow)

Requirements: DSH installed with the `web` profile booted once, Node.js ≥ 18,
an OpenCode GO subscription.

```bash
# 1. install the package into your web profile (pnpm; enable via corepack if needed)
dsh plugin --profile web add dsh-opencode-go-usage

# 2. store your GO API key as a DSH credential
#    (create the key at https://opencode.ai/auth)
#    → add to ~/.dsh/.credentials.yaml:
#      OPENCODE_GO_API_KEY: sk-...

# 3. restart `dsh web` and hard-refresh the browser page
```

That's it for the quota widget and `/opencode-go` command. The CLI reconciles
the package's `dsh.bundle.patch` into the profile's bundle stack automatically
— no manual `cordis.patch.yml` editing, no symlinks.

Not published on npm yet? Install from a checkout instead:

```bash
dsh plugin --profile web add /path/to/dsh-opencode-go-usage
```

> New to DSH plugins? Follow the [user guide](docs/INSTALL.zh.md) (Chinese, step-by-step).

## Usage

- **Widget**: read it. Collapsed sidebar → percentage badge; expanded → three progress bars with reset countdowns.
- **Command**: `/opencode-go` in any conversation prints the three windows as text.

## Config reference

On DSH `0.1.7-alpha.1`, open **Plugins → OpenCode GO Usage**. Legacy hosts
that expose plugin settings cards use their Settings page instead. Both paths
persist the same `dsh-opencode-go-usage` namespace; API-key material remains in
the DSH credentials store and is never sent back to the browser.

| key | default | description |
|---|---|---|
| `apiKeyEnv` | `OPENCODE_GO_API_KEY` | credential reference / env var name for the API key |
| `baseUrl` | `https://opencode.ai/zen/go` | gateway base URL |
| `cacheMs` | `30000` | host-side upstream cache TTL |
| `updateCheck` | `true` | check npm for a newer plugin version; turning it off makes no registry request |
| `injectSessionHeader` | `true` | inject the required `x-opencode-session` header for GO chat calls |
| `rollingWindowLabel` | `5h` | display-only label beside the rolling quota window |

## The usage API

`GET https://opencode.ai/zen/go/v1/usage` with `Authorization: Bearer <key>`:

```json
{
  "usage": {
    "rolling": { "status": "ok", "percent": 0,  "resetsAt": "2026-08-14T07:51:13Z" },
    "weekly":  { "status": "ok", "percent": 1,  "resetsAt": "2026-08-17T00:00:00Z" },
    "monthly": { "status": "ok", "percent": 22, "resetsAt": "2026-08-21T13:05:13Z" }
  }
}
```

## Developing / modifying the widget

The browser half is a **hand-authored factory bundle** (`window.__ModuleLoader__.load`), because out-of-tree client plugins have no public build pipeline yet. It may only `require()` modules from the shell module table (`react`, `react/jsx-runtime`, and the registered client packages). Edit `lib/client.js` directly, then restart `dsh web` and refresh the page — the bundle revision hash changes and the shell loads the new file.

Host changes (`lib/index.js`) need only a `dsh web` restart.

## Troubleshooting

- **Widget missing after restart** → hard-refresh the page (`Cmd/Ctrl+Shift+R`); the boot graph is injected per page load.
- **`/opencode-go/usage` returns 502 with "no API key"** → configure the key in `~/.dsh/.credentials.yaml`.
- **Gateway 401/403** → the key is invalid or the subscription lapsed; check the credential.
- **Widget shows an error string** → hover the collapsed badge or read the error line in the expanded widget.

## License

MIT
