# dsh-mcp-manager-ui

在 DeepSeek Harness 的 **Web 设置界面**里管理 MCP 服务器：设置 → **MCP**。

内置的 `@deepseek-ai/dsh-mcp-manager` 已经提供了一套运行中的服务器编队（`config.servers`、热增删、`probe`、`restart`、连接状态），但 Harness 没有为它提供界面。本插件补上这一页，不另建配置存储。

## 能做什么

- **列表**：每个服务器一张卡片，显示实时状态（已连接 · N 个工具 / 连接中 / 重连中 / 等待凭据 / 失败原因）、传输方式与来源（用户配置 / 用户覆盖 / 继承 / 插件注册）
- **启用 / 禁用**：开关写入 `enabled`，管理器即时卸载或挂载实例
- **新增 / 编辑**：stdio（命令、参数、环境变量、工作目录）与 streamable-http（URL、请求头），可选启动/调用/关闭超时与断线重连
- **从 JSON 导入**：粘贴单个对象、对象数组，或 `{ "servers": { 名称: 条目 } }` 映射；一次写入（原子）、可勾选覆盖同名条目，并可用「填入当前配置」把现有服务器导出成同样的 JSON
- **测试连接**（probe）：不触碰运行中的实例，返回服务端名称、工具清单、耗时与清理结果
- **重启**：重建单个实例并重置重连预算
- **删除**：只有用户层新增或覆盖的条目可删；继承自基础层时删除等价于恢复基础配置
- 页面每 2.5 秒刷新一次状态，操作后立即刷新
- **只读区「静态挂载的 MCP 客户端」**：`@deepseek-ai/dsh-mcp-client` 行写在 cordis 配置里（例如本机已有的 `pencil`、`rea`），不在内置管理器编队中。页面只列出名称、传输方式与 Loader 阶段，避免"管理器列表为空但其实有 MCP 工具"的误判；这些行仍要在 profile 的 `cordis.patch.yml` 里改

## 安装

以本地目录安装（PowerShell）：

```powershell
dsh plugin --profile <profile> add file:G:\G10_Projects\P20_Person\P50_AI_Coding\A30_my-dsh-plugins\dsh-mcp-manager-ui
```

或在 **设置 → 插件 → 插件管理** 里用「添加插件」选择本目录。

安装属于 bundle 层变更，**重启 dsh / 刷新页面后生效**；之后打开 设置 → **MCP**。

## 依赖

- `@deepseek-ai/dsh-mcp-manager`：提供 `config.servers`、运行时状态、`probe`、`restart`（Web/Desktop 配置默认已挂载）
- Settings 表单服务（`@deepseek-ai/dsh-settings` + `@deepseek-ai/dsh-config-editor`）：负责读取与持久化
- 客户端：`settings.section` 槽位（由 `@deepseek-ai/dsh-client-ui-settings` 声明）

缺少任一服务时页面会给出对应提示，而不是静默失败。

## 安全边界

- HTTP API（`/api/mcp-manager`）只接受本机回环请求；写操作参数走白名单校验
- 写入走 Settings 表单服务（`settings.mutate` + revision），与设置界面同一条持久化路径；不会手写或重排 profile 的 `cordis.patch.yml`
- 配置值（`env` / `headers` / `command` / `url` 等）对管理界面可见 —— 这是内置管理器与 Settings 通道的既有语义。**密钥请放进凭据服务**，在值里写 `${credential:REF}`
- 不新增模型可见的工具或提示词；页面只是管理面

## 开发

```powershell
node tests/host.test.js          # 23 项宿主侧测试 (校验 / 合并 / 导入 / HTTP 路由与错误码), 无需额外依赖
node tests/client-module.test.js  # 9 项客户端测试 (加载真实模块、假钩子渲染首屏、草稿/合并/导入解析)
node --check client.js            # 客户端纯 JS, 无构建步骤
```

- `index.js`：宿主入口，注册 `/api/mcp-manager` 路由
- `lib/host/api.js`：HTTP 处理（state / action：probe、restart、enable、disable、add、save、delete、import），错误同时返回 `code` 供页面本地化；`import` 用单次 `mutate` 原子写入
- `lib/host/servers.js`：条目校验、摘要、配置真相与运行时真相合并
- `lib/host/namespace.js`：定位 `mcp-manager` 的 Settings 命名空间
- `client.js`：浏览器模块，注册 `settings.section`（id `mcp`）与导航图标；不依赖任何 Harness Client 包，只用 `react` 与 `--dsw-alias-*` 主题 token

## 已知限制

- 只能管理内置管理器辖下的服务器；由 agent preset 或静态 `cordis.yml` 行挂载的 mcp-client 实例只读列出（见上），不能在此增删改
- 插件注册（`mcpManager.register`）的服务器只读
- 每次编辑提交时会保留表单没有建模的字段（如 `reconnect` 的重连间隔与次数）；表单里清空的字段会被移除，回落到继承值或默认值
- 页面在对话框打开期间暂停状态轮询，避免打断输入；关闭后自动恢复
- 删除继承条目只会移除用户层覆盖，无法删除基础层配置（这是内置管理器的语义）
- 状态靠轮询（2.5 秒），不是服务端推送
- **名字不要与静态挂载的客户端重复**：导入同名条目会写入成功，但受管实例挂载失败（`failed/load`，报 `serverName "…" is already in use`），静态实例照旧运行。导入对话框会提前标出这类冲突
- 首次写入后 profile 补丁会留下 `mcp-manager` 行的显式 `servers` 映射（Settings 通道的持久化方式），空映射与默认值等价
