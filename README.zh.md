# dsh-opencode-go-usage

[English](README.md) | 中文

> ⚡ **OpenCode GO 套餐**: [buycodingplan.com](https://buycodingplan.com/)

[DSH](https://github.com/deepseek-ai/deepseek-harness)(DeepSeek Harness)插件:监控你的 **OpenCode GO 套餐**额度 —— 10 美元/月的订阅,按模型提供滚动 5 小时 / 每周 / 每月三个窗口的用量限额。

## DSH 兼容性

同一个包覆盖旧版和当前的 DSH 设置 API。它在运行时判断宿主，不会因为 DSH
较旧就要求另装一个包。**最低支持的 DSH 宿主版本是 `0.1.0-rc.8`**；更早版本
不在支持范围内。

| DSH 宿主 | 可用功能 |
|---|---|
| 旧 Settings 接口（`0.1.0-rc.8` 至 `0.1.6-alpha.2`） | 侧边栏小组件、同源用量代理、聊天命令，以及通过 `settings.register()` / `get()` / `update()` 配置。宿主提供该槽位时，显示旧版 `settings.plugin.item` 配置卡。 |
| Loader Config 接口（`0.1.7-alpha.1`、`0.1.7-alpha.2`） | 使用 Loader entry 和 `configEditor`，渲染 `plugins.bundle.config`，并在 HMR 时安全释放 Web 路由。 |

Schema 刻意保持为非 volatile，因此最早旧版宿主随附的 Schemastery 也可以加载。后续
DSH 预发布版只有在仍保留上述两类接口之一时才承诺支持；预发布 API 不视为稳定。
包内还带有中英文 Plugin Manager 元数据；旧宿主会安全回退到 `package.json` 里的
英文说明。

`x-opencode-session` 修复是机会式能力：宿主没有在 `llm/stream` 提供 session id
时，它会保持未激活；额度小组件、同源代理和 `/opencode-go` 命令仍可正常工作。

## 功能

- **侧边栏小组件**:常驻 DSH Web 侧边栏底部(`sidebar.footer.action` 槽位),三条用量进度条:滚动窗口(5h)、周窗口、月窗口,每条带重置倒计时;侧边栏收起时收缩为紧凑的百分比徽标。
- **`/opencode-go` 聊天命令**:在对话中以文本输出同样的三个窗口数字。
- **同源代理**:host 端注册 `GET /opencode-go/usage`,携带你的 API key 转发到官方 GO 网关。key 永不进入浏览器,也没有 CORS 问题。
- **`x-opencode-session` 修复**:运行时自动为 OpenCode GO 网关的聊天请求注入真实会话 ID(网关对缺失该头的请求返回 400)。不修改 DSH 安装文件,升级不失效。
- **配置卡**:可在两代 DSH 设置界面中修改网关、凭据引用、缓存、更新检查、会话头修复和滚动窗口标签。

## `x-opencode-session` 修复

OpenCode GO 网关拒绝缺少 `x-opencode-session` 头的聊天补全请求(`HTTP 400 MissingSessionID`),而 DSH 的 `llm-pi-ai` 适配器从不发送该头。与其修改 DSH 安装目录里的文件(每次 DSH 升级都会被覆盖),本插件改为运行时注入:

- 一次性包装 `globalThis.fetch`;
- 监听 DSH 官方 `llm/stream` waterfall 事件,获取每次调用的会话 ID(`options.sessionId`,由 `dsh-agent-loop` 填充)。

网关 base 从**被调用 provider 自身的设置**解析(`llm-pi-ai.providers.<route>.baseURL`,缺省回退到本插件的 `baseUrl`)——代码中不硬编码任何域名——因此只有发往该调用对应网关的请求才会收到该头,且值为真实的会话级 ID。

- 开关:设置命名空间中的 `injectSessionHeader`(默认 `true`)。
- 可观测性:`GET /opencode-go/usage` 返回 `sessionHeader: { active, count, diag }`;`diag` 报告运行时观测,如 `streamSeen`(处理过的 `llm/stream` 调用数)、`lastStream`(provider、session-id 是否存在、base 及其来源)、`requests`/`injected`/`missed`(带上下文的 wire 请求数 / 实际注入数 / 因 URL 不匹配未注入数)。

## 工作原理

这是一个**双端 DSH 插件包**:

| 端 | 文件 | 职责 |
|---|---|---|
| host(Node) | `lib/index.js` | 注册 `/opencode-go/usage` Web 路由(`ctx.webServer`)与 `/opencode-go` 命令(`ctx.commands`);通过 DSH credentials 解析 key;上游调用带 30s 缓存 |
| 浏览器 | `lib/client.js` | 手写的 `window.__ModuleLoader__.load({ id, factory })` bundle，等待 `sidebar.footer.action` 列表槽就绪后注册，每 60s 轮询同源路由 |

`package.json` 声明了 `"dsh": { "client": { "platform": "web" } }`,DSH 的 client-modules 节点端会把它扫描进浏览器启动图(`window.__DSH_BOOT__`),并在 `/plugins/dsh-opencode-go-usage/client.js` 提供该 bundle。

### 官方安装下小组件如何加载

`dsh plugin add` 把包装进 profile,满足 host 端(路由、命令、设置)。DSH 的
client-modules 扫描器只能从 DSH 自己的安装目录解析浏览器 bundle,所以装在
profile 里的第三方包通常拿不到浏览器端——本插件通过**自托管**解决:host 端
注册 `/dsh-opencode-go-usage/client.js` 路由,并用官方 `webServer.tapIndex` API
把 boot graph 行注入页面。因此侧边栏小组件在任何安装位置都能工作。

## 环境要求

- 已安装 DSH 且 `web` profile 至少启动过一次(`~/.dsh/profiles/web` 存在)
- Node.js ≥ 18(需要 `fetch`)
- OpenCode GO 订阅及其 API key

## 安装(官方 DSH 流程)

前置:已装 DSH 且 `web` profile 至少启动过一次;Node.js ≥ 18;有 OpenCode GO 订阅。

```bash
# 1. 安装到 web profile(依赖 pnpm,没有的话先 corepack enable)
dsh plugin --profile web add dsh-opencode-go-usage

# 2. 把 GO API key 存为 DSH credential
#    (key 在 https://opencode.ai/auth 创建)
#    → 在 ~/.dsh/.credentials.yaml 加一行:
#      OPENCODE_GO_API_KEY: sk-...

# 3. 重启 dsh web,浏览器硬刷新(Cmd/Ctrl+Shift+R)
```

到这一步,百分比小组件和 `/opencode-go` 命令就生效了。CLI 会自动把包的
`dsh.bundle.patch` 合并进 profile 的 bundle 层栈——**不需要手改
cordis.patch.yml,不需要软链**。

还没发布 npm?从本地目录安装:

```bash
dsh plugin --profile web add /path/to/dsh-opencode-go-usage
```

> 第一次装 DSH 插件?直接看[使用者指南](docs/INSTALL.zh.md),一步步照着做就行。

## 使用

- **小组件**:直接看。侧边栏收起 → 百分比徽标;展开 → 三条进度条 + 重置倒计时。
- **命令**:任意对话里输入 `/opencode-go` 输出三个窗口的文本。

## 配置项

DSH `0.1.7-alpha.1` 请打开 **插件 → OpenCode GO 用量**。提供插件设置卡的旧版
DSH 则从其设置页进入。两条路径都写入同一个 `dsh-opencode-go-usage` 命名空间；
API key 始终保存在 DSH 凭据存储中，绝不会返回给浏览器。

| 键 | 默认 | 说明 |
|---|---|---|
| `apiKeyEnv` | `OPENCODE_GO_API_KEY` | API key 的 credential 引用 / 环境变量名 |
| `baseUrl` | `https://opencode.ai/zen/go` | 网关 base URL |
| `cacheMs` | `30000` | host 端上游缓存 TTL |
| `updateCheck` | `true` | 检查 npm 是否有新版；关闭后不会发起任何 registry 请求 |
| `injectSessionHeader` | `true` | 为 GO 聊天请求注入必需的 `x-opencode-session` 头 |
| `rollingWindowLabel` | `5h` | 滚动额度窗口旁的纯展示标签 |

## 用量 API

`GET https://opencode.ai/zen/go/v1/usage`,带 `Authorization: Bearer <key>`:

```json
{
  "usage": {
    "rolling": { "status": "ok", "percent": 0,  "resetsAt": "2026-08-14T07:51:13Z" },
    "weekly":  { "status": "ok", "percent": 1,  "resetsAt": "2026-08-17T00:00:00Z" },
    "monthly": { "status": "ok", "percent": 22, "resetsAt": "2026-08-21T13:05:13Z" }
  }
}
```

## 开发 / 修改小组件

浏览器端是**手写的 factory bundle**(`window.__ModuleLoader__.load`),因为目前第三方 client 插件还没有公开的构建流水线。它只能 `require()` shell 模块表里的模块(`react`、`react/jsx-runtime` 以及已注册的 client 包)。直接改 `lib/client.js`,然后重启 `dsh web` 并刷新页面 —— bundle 的 revision hash 会变化,shell 会加载新文件。

host 端(`lib/index.js`)的改动只需重启 `dsh web`。

## 常见问题

- **重启后小组件不出现** → 硬刷新页面(`Cmd/Ctrl+Shift+R`);启动图是按页面加载注入的。
- **`/opencode-go/usage` 返回 502 且提示 "no API key"** → 在 `~/.dsh/.credentials.yaml` 配置 key。
- **网关 401/403** → key 无效或订阅过期;检查 credential。
- **小组件显示错误串** → 悬停收起态徽标,或展开态小组件里的错误行。

## License

MIT
