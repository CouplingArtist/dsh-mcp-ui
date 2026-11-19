# dsh-mcp-ui

一个 DeepSeek Harness 用户安装插件，在 Web 设置界面提供 MCP 服务器的管理页（设置 → MCP）。它不持有自己的配置存储：读写的都是内置 `@deepseek-ai/dsh-mcp-manager` 的 `config.servers`。

平台概念（Loader 行、profile 补丁、Settings 表单服务）见 Harness 文档，此处只定义本插件独有的术语。

## Language

**受管服务器**:
写在内置管理器 `config.servers` 里的条目；管理器为它挂载 mcp-client 实例，本页可增删改、启用禁用、探测与重启。
_Code name_: ManagedServer
_Avoid_: 配置服务器（与"静态挂载"混淆）

**静态客户端**:
直接以 `@deepseek-ai/dsh-mcp-client` 行写在 cordis 配置里的服务器实例，不属于管理器编队，本页只读列出。
_Code name_: UnmanagedClient
_Avoid_: 内置服务器（会被误读为 Harness 自带的服务器）

**来源**:
一行服务器的归属层：用户配置（用户层新增）、用户覆盖（用户层覆盖继承值）、继承（基础层提供）、插件注册（`mcpManager.register`）、残留记录（已移除但清理未完成）。
_Code name_: Origin
_Avoid_: 类型（"类型"只用于 transport）

**探测**:
内置管理器的 `probe(name)`：解析模板、连接、列出工具再关闭，不触碰运行中的实例。中文 UI 动词用"测试连接"。
_Code name_: Probe
_Avoid_: 健康检查（会暗示持续监控，本页只有一次性探测）

**状态**:
管理器发布的 `McpConnectionStatus`（connected / connecting / reconnecting / waiting-credentials / closed / failed），页面按 2.5 秒轮询刷新。
_Code name_: Status
_Avoid_: 运行态（运行时真相还包含 Loader 阶段，静态客户端用的是后者）
