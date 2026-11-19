window.__ModuleLoader__.load({
  id: 'dsh-mcp-ui',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    /** 宿主路由前缀, 与 lib/host/api.js 的 ENDPOINT 一致。 */
    const ENDPOINT = '/api/mcp-manager'
    /** 页面文案命名空间。 */
    const NS = 'settings.mcpManager'
    /** 轮询间隔: 连接状态由宿主推送不了, 页面自取。 */
    const POLL_MS = 2500
    /** 请求兜底超时: 连不上宿主时按钮也必须恢复, 不能永久"测试中"。 */
    const REQUEST_TIMEOUT_MS = 45_000

    // ---------------------------------------------------------------- 文案

    const zh = {
      section: 'MCP',
      title: 'MCP 服务器',
      subtitle: '{n} 个受管服务器 · {connected} 个已连接',
      refresh: '刷新',
      add: '添加服务器',
      loading: '加载中…',
      empty: '内置管理器里还没有服务器。',
      emptyHint: '添加一个服务器后，它的工具会以 mcp__<名称>__<工具名> 出现在可用工具里。',
      emptyUnmanaged: '下面列出的静态挂载客户端由 cordis 配置管理，不受本页控制。',
      missingManager: '当前配置没有加载内置 MCP 管理器（@deepseek-ai/dsh-mcp-manager），本页无法管理服务器。',
      missingSettings: '当前配置没有 Settings 表单服务，无法读取或保存 MCP 配置。',
      missingNamespace: '未找到 MCP 管理器的配置命名空间（{reason}）。',
      configNote: '读写内置管理器的 config.servers（写入用户 profile 补丁层）；配置值对管理界面可见，密钥请放进凭据服务并用 ${credential:REF} 引用。',
      originUser: '用户配置',
      originOverride: '用户覆盖',
      originInherited: '继承',
      originRegistered: '插件注册',
      originStale: '残留记录',
      on: '已启用',
      off: '已禁用',
      test: '测试连接',
      testing: '测试中…',
      restart: '重启',
      edit: '编辑',
      delete: '删除',
      deleteTitle: '删除 MCP 服务器',
      deleteConfirm: '删除 {name}？它的工具会立即从可用工具中移除。',
      deleteInherited: '该服务器来自基础配置层，删除只会移除用户层覆盖并恢复基础配置。',
      cancel: '取消',
      confirmDelete: '确认删除',
      close: '关闭',
      enable: '启用',
      disable: '禁用',
      toggleLabel: '启用 {name}',
      deleteConfirmOverride: '删除 {name} 的用户层覆盖？基础配置会恢复，该服务器可能继续以基础配置运行。',
      probeCleanup: '清理',
      probeMore: '还有 {n} 个',
      scope: '只管理内置管理器 config.servers 里的服务器；静态挂载的 dsh-mcp-client 行只读列在下方，需在 profile 的 cordis.patch.yml 里修改。',
      originStatic: '静态挂载',
      nsReasonMissing: '未找到管理器条目',
      nsReasonDescribeFailed: '读取设置失败',
      argsDetail: '参数',
      envDetail: '环境变量',
      headersDetail: '请求头',
      importJson: '从 JSON 导入',
      importTitle: '从 JSON 导入服务器',
      importHint: '支持三种形态：单个对象（含 name）、对象数组，或 { "servers": { 名称: 条目 } } 映射；条目字段与新增服务器一致。',
      importExample: '{"name":"pencil","transport":"stdio","command":"npx","args":["-y","pkg"],"env":{}}',
      importOverwrite: '覆盖已存在的同名服务器',
      importFill: '填入当前配置',
      importSubmit: '导入',
      importPreview: '将导入 {n} 个：{names}',
      importEmpty: '没有可导入的服务器条目。',
      importBadJson: 'JSON 解析失败：{message}',
      importBadShape: 'JSON 结构不支持：需要单个服务器对象、对象数组，或 { "servers": { … } } 映射。',
      importBadName: '每个条目都需要合法的 name（字母、数字、下划线、短横线，≤32）。',
      imported: '已导入 {n} 个服务器',
      importedOverwrite: '已导入 {n} 个服务器（同名的按覆盖处理）',
      importNote: '导入是一次原子写入：任何一条不合法都不会写入。环境变量与请求头建议使用 ${credential:REF}。',
      importStaticConflict: '这些名称已被静态挂载的客户端占用，导入后受管实例会挂载失败（静态实例不受影响）：{names}',
      errNameConflicts: '已存在同名服务器：{names}',
      errImportEmpty: '导入内容里没有服务器条目。',
      errImportDuplicate: '导入内容里重复出现服务器名：{name}。',
      errImportTooMany: '一次最多导入 {max} 个服务器。',
      errNameInvalid: '服务器名只能包含字母、数字、下划线和短横线，长度 1-32。',
      errNameExists: '已存在同名服务器 {name}。',
      errServerMissing: '服务器 {name} 不存在，可能已被其他窗口删除。',
      errManagerMissing: '内置 MCP 管理器未加载，无法执行该操作。',
      errNamespaceMissing: '未找到管理器的配置命名空间（{reason}）。',
      errWriteFailed: '写入配置失败：{message}',
      errRestartFailed: '重启失败：{message}',
      errBadRequest: '请求无效。',
      errGeneric: '操作失败。',
      errTimeout: '请求超时，请重试。',
      addTitle: '添加 MCP 服务器',
      editTitle: '编辑 MCP 服务器',
      name: '名称',
      nameHint: '工具命名空间：mcp__<名称>__<工具名>。仅字母、数字、下划线、短横线，最长 32。',
      transport: '传输方式',
      transportStdio: 'stdio（本地进程）',
      transportHttp: 'streamable-http（远程 URL）',
      command: '命令',
      args: '参数（每行一个）',
      env: '环境变量（KEY=VALUE，每行一个）',
      cwd: '工作目录（可选）',
      url: 'URL',
      headers: '请求头（KEY=VALUE，每行一个）',
      startupTimeout: '启动超时（毫秒，可选）',
      toolCallTimeout: '工具调用超时（毫秒，可选）',
      closeTimeout: '关闭超时（毫秒，可选）',
      reconnect: '断线自动重连',
      advanced: '高级选项',
      save: '保存',
      saving: '保存中…',
      saved: '已保存 {name}',
      added: '已添加 {name}',
      deleted: '已删除 {name}',
      enabledNotice: '已启用 {name}',
      disabledNotice: '已禁用 {name}',
      restarted: '已重启 {name}',
      probeTitle: '连接测试结果',
      probeOk: '连接成功',
      probeFail: '连接失败',
      probeStage: '阶段',
      probeServer: '服务端',
      probeTools: '工具',
      probeTruncated: '（已截断）',
      probeDuration: '耗时 {ms} ms',
      probeCleanupOk: '已确认关闭',
      probeCleanupFail: '清理异常：{message}',
      statusConnected: '已连接 · {n} 个工具',
      statusConnecting: '连接中（第 {n} 次）',
      statusReconnecting: '重连中（第 {n}/{max} 次）',
      statusWaitingCredentials: '等待凭据',
      statusClosed: '已关闭',
      statusDisabled: '已禁用',
      statusUnobserved: '未观察',
      statusLoadFailed: '加载失败',
      statusCleanupFailed: '清理失败',
      statusGaveUp: '重连次数用尽',
      statusReconnectDisabled: '已停止重连',
      statusUnclosed: '连接未确认关闭',
      statusRegistered: '插件注册',
      statusStale: '待清理',
      lastError: '最近错误',
      secretMasked: '已隐藏',
      secretHint: '值支持 ${credential:REF} 模板；建议不要在这里写明文密钥。',
      inheritedHint: '该服务器来自基础层，保存会在用户层生成覆盖。',
      readOnlyRegistered: '插件注册的服务器由所属插件管理，不能在这里编辑。',
      endpoint: '端点',
      tools: '工具',
      none: '—',
      nameInvalid: '名称只能包含字母、数字、下划线和短横线，长度 1-32。',
      commandRequired: 'stdio 传输需要填写命令。',
      urlRequired: 'streamable-http 传输需要填写合法的 http(s) URL。',
      kvInvalid: '第 {line} 行不是 KEY=VALUE 形式。',
      numberInvalid: '{field} 必须是正整数。',
      loadError: '读取失败：{message}',
      actionError: '操作失败：{message}',
      reload: '重试',
      unmanagedTitle: '静态挂载的 MCP 客户端',
      unmanagedHint: '这些 @deepseek-ai/dsh-mcp-client 行写在 cordis 配置里，不在内置管理器的编队中，因此这里只读列出。',
      phasePending: '待启动',
      phaseLoading: '启动中',
      phaseActive: '运行中',
      phaseFailed: '启动失败',
      phaseUnloading: '卸载中',
      phaseUnknown: '未观察',
    }

    const en = {
      section: 'MCP',
      title: 'MCP servers',
      subtitle: '{n} managed · {connected} connected',
      refresh: 'Refresh',
      add: 'Add server',
      loading: 'Loading…',
      empty: 'The built-in manager has no servers yet.',
      emptyHint: 'Add a server and its tools show up as mcp__<name>__<tool>.',
      emptyUnmanaged: 'The statically mounted clients below live in the Cordis configuration and are not controlled here.',
      missingManager: 'The built-in MCP manager (@deepseek-ai/dsh-mcp-manager) is not loaded, so this page cannot manage servers.',
      missingSettings: 'The settings form service is not loaded, so MCP configuration cannot be read or written.',
      missingNamespace: 'The MCP manager configuration namespace was not found ({reason}).',
      configNote: 'Reads and writes the built-in manager config.servers (user profile patch layer). Configuration values are visible to this surface; keep secrets in the credential service and reference them with ${credential:REF}.',
      originUser: 'User',
      originOverride: 'User override',
      originInherited: 'Inherited',
      originRegistered: 'Plugin',
      originStale: 'Cleanup pending',
      on: 'Enabled',
      off: 'Disabled',
      test: 'Test',
      testing: 'Testing…',
      restart: 'Restart',
      edit: 'Edit',
      delete: 'Delete',
      deleteTitle: 'Delete MCP server',
      deleteConfirm: 'Delete {name}? Its tools are withdrawn from the available tools immediately.',
      deleteInherited: 'This server comes from the base configuration layer; deleting removes the user-layer override and restores the base.',
      cancel: 'Cancel',
      confirmDelete: 'Delete',
      close: 'Close',
      enable: 'Enable',
      disable: 'Disable',
      toggleLabel: 'Enable {name}',
      deleteConfirmOverride: 'Remove the user-layer override for {name}? The base configuration is restored, so the server may keep running with the base settings.',
      probeCleanup: 'Cleanup',
      probeMore: 'and {n} more',
      scope: 'Only servers in the built-in manager config.servers are managed here; statically mounted dsh-mcp-client rows are listed read-only below and belong in the profile cordis.patch.yml.',
      originStatic: 'Static mount',
      nsReasonMissing: 'Manager entry not found',
      nsReasonDescribeFailed: 'Settings read failed',
      argsDetail: 'Arguments',
      envDetail: 'Environment',
      headersDetail: 'Headers',
      importJson: 'Import JSON',
      importTitle: 'Import servers from JSON',
      importHint: 'Accepts a single object with a name, an array of objects, or a { "servers": { name: entry } } map. Fields match the add-server form.',
      importExample: '{"name":"pencil","transport":"stdio","command":"npx","args":["-y","pkg"],"env":{}}',
      importOverwrite: 'Overwrite existing servers with the same name',
      importFill: 'Fill with current config',
      importSubmit: 'Import',
      importPreview: 'Will import {n}: {names}',
      importEmpty: 'There is no server entry to import.',
      importBadJson: 'Could not parse the JSON: {message}',
      importBadShape: 'Unsupported JSON shape: use a single server object, an array of objects, or a { "servers": { … } } map.',
      importBadName: 'Every entry needs a valid name (letters, digits, underscore, dash, at most 32).',
      imported: 'Imported {n} servers',
      importedOverwrite: 'Imported {n} servers (same names overwritten)',
      importNote: 'The import is one atomic write: an invalid entry writes nothing. Prefer ${credential:REF} for environment values and headers.',
      importStaticConflict: 'These names are already used by statically mounted clients; the managed instances will fail to mount (the static ones are unaffected): {names}',
      errNameConflicts: 'These servers already exist: {names}',
      errImportEmpty: 'There is no server entry to import.',
      errImportDuplicate: 'The import repeats the server name {name}.',
      errImportTooMany: 'At most {max} servers can be imported at once.',
      errNameInvalid: 'Use letters, digits, underscore and dash only, 1-32 characters.',
      errNameExists: 'A server named {name} already exists.',
      errServerMissing: 'Server {name} no longer exists; it may have been removed in another window.',
      errManagerMissing: 'The built-in MCP manager is not loaded, so this action is unavailable.',
      errNamespaceMissing: 'The manager configuration namespace was not found ({reason}).',
      errWriteFailed: 'Could not write the configuration: {message}',
      errRestartFailed: 'Restart failed: {message}',
      errBadRequest: 'The request was rejected.',
      errGeneric: 'The action failed.',
      errTimeout: 'The request timed out; try again.',
      addTitle: 'Add MCP server',
      editTitle: 'Edit MCP server',
      name: 'Name',
      nameHint: 'Tool namespace: mcp__<name>__<tool>. Letters, digits, underscore and dash only, at most 32.',
      transport: 'Transport',
      transportStdio: 'stdio (local process)',
      transportHttp: 'streamable-http (remote URL)',
      command: 'Command',
      args: 'Arguments (one per line)',
      env: 'Environment (KEY=VALUE, one per line)',
      cwd: 'Working directory (optional)',
      url: 'URL',
      headers: 'Headers (KEY=VALUE, one per line)',
      startupTimeout: 'Startup timeout (ms, optional)',
      toolCallTimeout: 'Tool-call timeout (ms, optional)',
      closeTimeout: 'Close timeout (ms, optional)',
      reconnect: 'Reconnect automatically',
      advanced: 'Advanced',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved {name}',
      added: 'Added {name}',
      deleted: 'Deleted {name}',
      enabledNotice: 'Enabled {name}',
      disabledNotice: 'Disabled {name}',
      restarted: 'Restarted {name}',
      probeTitle: 'Connection test',
      probeOk: 'Connected',
      probeFail: 'Connection failed',
      probeStage: 'Stage',
      probeServer: 'Server',
      probeTools: 'Tools',
      probeTruncated: '(truncated)',
      probeDuration: 'Took {ms} ms',
      probeCleanupOk: 'Close confirmed',
      probeCleanupFail: 'Cleanup error: {message}',
      statusConnected: 'Connected · {n} tools',
      statusConnecting: 'Connecting (attempt {n})',
      statusReconnecting: 'Reconnecting ({n}/{max})',
      statusWaitingCredentials: 'Waiting for credentials',
      statusClosed: 'Closed',
      statusDisabled: 'Disabled',
      statusUnobserved: 'Not observed',
      statusLoadFailed: 'Load failed',
      statusCleanupFailed: 'Cleanup failed',
      statusGaveUp: 'Reconnect budget used up',
      statusReconnectDisabled: 'Reconnect disabled',
      statusUnclosed: 'Close not confirmed',
      statusRegistered: 'Plugin registered',
      statusStale: 'Cleanup pending',
      lastError: 'Last error',
      secretMasked: 'hidden',
      secretHint: 'Values support the ${credential:REF} template; prefer that over plaintext secrets.',
      inheritedHint: 'Inherited from the base layer; saving creates a user-layer override.',
      readOnlyRegistered: 'A plugin registers this server; edit it through that plugin.',
      endpoint: 'Endpoint',
      tools: 'Tools',
      none: '—',
      nameInvalid: 'Use letters, digits, underscore and dash only, 1-32 characters.',
      commandRequired: 'stdio transport needs a command.',
      urlRequired: 'streamable-http transport needs a valid http(s) URL.',
      kvInvalid: 'Line {line} is not KEY=VALUE.',
      numberInvalid: '{field} must be a positive integer.',
      loadError: 'Could not load: {message}',
      actionError: 'Action failed: {message}',
      reload: 'Retry',
      unmanagedTitle: 'Statically mounted MCP clients',
      unmanagedHint: 'These @deepseek-ai/dsh-mcp-client rows live in the Cordis configuration and are outside the built-in manager fleet, so they are listed read-only.',
      phasePending: 'Pending',
      phaseLoading: 'Loading',
      phaseActive: 'Active',
      phaseFailed: 'Failed',
      phaseUnloading: 'Unloading',
      phaseUnknown: 'Not observed',
    }

    function fill(template, values) {
      let out = template
      for (const [key, value] of Object.entries(values ?? {})) out = out.split(`{${key}}`).join(String(value))
      return out
    }

    // ---------------------------------------------------------------- HTTP

    async function request(method, path, body) {
      const controller = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        : undefined
      const response = await fetch(`${ENDPOINT}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller,
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        // 空响应或非 JSON: 交给状态码判定。
      }
      if (!response.ok) {
        const failure = new Error(payload?.error ?? `HTTP ${response.status}`)
        failure.code = payload?.code
        failure.params = payload?.params
        throw failure
      }
      return payload
    }

    const api = {
      state: () => request('GET', '/state'),
      act: (body) => request('POST', '/action', body),
    }

    /** 宿主只返回中文兜底文案; 已知错误码按当前界面语言重新渲染。 */
    const ERROR_KEYS = {
      'name-invalid': 'errNameInvalid',
      'name-exists': 'errNameExists',
      'server-missing': 'errServerMissing',
      'manager-missing': 'errManagerMissing',
      'manager-namespace-missing': 'errNamespaceMissing',
      'write-failed': 'errWriteFailed',
      'restart-failed': 'errRestartFailed',
      'entry-invalid': 'errBadRequest',
      'bad-request': 'errBadRequest',
      'bad-json': 'errBadRequest',
      'body-too-large': 'errBadRequest',
      'unknown-action': 'errBadRequest',
      'loopback-only': 'errBadRequest',
      'not-found': 'errBadRequest',
      'name-conflicts': 'errNameConflicts',
      'import-empty': 'errImportEmpty',
      'import-duplicate': 'errImportDuplicate',
      'import-too-many': 'errImportTooMany',
    }

    function formatError(t, error) {
      const key = error?.code === undefined ? undefined : ERROR_KEYS[error.code]
      if (key !== undefined) return fill(t(key), error.params ?? {})
      // 网络层失败没有宿主文案: 超时与连接失败各给一条本地化提示。
      if (error?.name === 'TimeoutError') return t('errTimeout')
      if (error?.name === 'TypeError') return t('errGeneric')
      return error?.message ?? String(error)
    }

    // ---------------------------------------------------------------- 样式

    const CSS = `
.mcpui-root { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 760px; color: var(--dsw-alias-label-primary); }
.mcpui-head { display: flex; align-items: flex-start; gap: 10px; }
.mcpui-headings { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.mcpui-title { margin: 0; font-size: 15px; line-height: 22px; font-weight: 600; }
.mcpui-subtitle { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.mcpui-headActions { display: inline-flex; align-items: center; gap: 8px; flex: none; }
.mcpui-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 5px 12px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.mcpui-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.mcpui-btn:disabled { opacity: 0.55; cursor: default; }
.mcpui-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.mcpui-btn[data-variant='primary'] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
.mcpui-btn[data-variant='primary']:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); filter: brightness(1.08); }
.mcpui-btn[data-variant='danger'] { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent); }
.mcpui-btn[data-variant='danger'][data-solid='true'] { background: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-bg-base); }
.mcpui-btn[data-variant='danger'][data-solid='true']:hover:not(:disabled) { background: var(--dsw-alias-state-error-primary); filter: brightness(0.92); }
.mcpui-btn[data-size='sm'] { padding: 3px 9px; font-size: 12px; line-height: 16px; }
.mcpui-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.mcpui-notice { margin: 0; border-radius: 8px; padding: 6px 12px; font-size: 13px; line-height: 20px; }
.mcpui-notice[data-tone='ok'] { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent); }
.mcpui-notice[data-tone='error'] { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); }
.mcpui-banner { display: flex; flex-direction: column; gap: 6px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent); border-radius: 10px; padding: 10px 14px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent); font-size: 13px; line-height: 20px; }
.mcpui-banner code { font-family: var(--ds-font-family-code); font-size: 12px; }
.mcpui-subhead { margin-bottom: 6px; }
.mcpui-subhead .mcpui-title { font-size: 13px; }
.mcpui-cards { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
.mcpui-card { min-width: 0; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1)); }
.mcpui-card[data-open='true'] { border-color: var(--dsw-alias-border-l1); }
.mcpui-cardRow { display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 8px 12px; }
.mcpui-main { display: flex; flex: 1; min-width: 0; align-items: center; gap: 8px; border: 0; padding: 4px 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.mcpui-main:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; border-radius: 6px; }
.mcpui-chevron { flex: none; color: var(--dsw-alias-label-secondary); transition: transform 140ms ease; font-size: 10px; line-height: 1; }
.mcpui-card[data-open='true'] .mcpui-chevron { transform: rotate(180deg); }
.mcpui-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
.mcpui-dot[data-tone='ok'] { background: var(--dsw-alias-state-success-primary); }
.mcpui-dot[data-tone='warn'] { background: var(--dsw-alias-state-warn-primary); }
.mcpui-dot[data-tone='error'] { background: var(--dsw-alias-state-error-primary); }
.mcpui-dot[data-tone='busy'] { background: var(--dsw-alias-brand-primary); }
.mcpui-name { min-width: 0; overflow: hidden; font-size: 14px; line-height: 20px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.mcpui-pill { flex: none; border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 16px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.mcpui-pill[data-tone='warn'] { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); color: var(--dsw-alias-state-warn-primary); }
.mcpui-pill[data-tone='error'] { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); color: var(--dsw-alias-state-error-primary); }
.mcpui-pill[data-tone='ok'] { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); color: var(--dsw-alias-state-success-primary); }
.mcpui-state { flex: none; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.mcpui-state[data-tone='error'] { color: var(--dsw-alias-state-error-primary); }
.mcpui-state[data-tone='warn'] { color: var(--dsw-alias-state-warn-primary); }
.mcpui-actions { display: inline-flex; flex: none; align-items: center; gap: 4px; }
.mcpui-iconBtn { width: 26px; height: 26px; flex: none; padding: 0; border-color: transparent; color: var(--dsw-alias-label-secondary); }
.mcpui-iconBtn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.mcpui-iconBtn[data-tone='danger'] { color: var(--dsw-alias-state-error-primary); }
.mcpui-iconBtn[data-tone='danger']:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
.mcpui-spin { transform-origin: 50% 50%; animation: mcpui-spin 900ms linear infinite; }
@keyframes mcpui-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .mcpui-spin { animation-duration: 2400ms; } }
.mcpui-details { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--dsw-alias-border-l2); padding: 10px 14px 12px; background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2)); font-size: 12px; line-height: 18px; }
.mcpui-kv { display: flex; gap: 8px; min-width: 0; }
.mcpui-kvKey { flex: none; width: 88px; color: var(--dsw-alias-label-secondary); }
.mcpui-kvValue { min-width: 0; overflow-wrap: anywhere; font-family: var(--ds-font-family-code); }
.mcpui-kvValue[data-plain='true'] { font-family: inherit; }
.mcpui-error { color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.mcpui-warn { color: var(--dsw-alias-state-warn-primary); }
.mcpui-empty { display: flex; flex-direction: column; gap: 4px; border: 1px dashed var(--dsw-alias-border-l1); border-radius: 10px; padding: 18px 16px; }
.mcpui-empty strong { font-size: 13px; font-weight: 600; }
.mcpui-probe { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 8px 10px; background: var(--dsw-alias-bg-layer-1); }
.mcpui-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.mcpui-chip { max-width: 100%; overflow-wrap: anywhere; border-radius: 5px; padding: 1px 6px; background: var(--dsw-alias-bg-layer-2); font-family: var(--ds-font-family-code); font-size: 11px; line-height: 16px; }
.mcpui-switch { position: relative; flex: none; width: 34px; height: 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 0; background: var(--dsw-alias-bg-layer-2); cursor: pointer; transition: background 140ms ease, border-color 140ms ease; }
.mcpui-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.mcpui-switch:disabled { opacity: 0.55; cursor: default; }
.mcpui-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.mcpui-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform 140ms ease; }
.mcpui-switch[aria-checked='true'] .mcpui-knob { transform: translateX(16px); }
.mcpui-overlay { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0, 0, 0, 0.36); }
.mcpui-dialog { box-sizing: border-box; width: min(560px, 100%); max-height: 86vh; overflow-y: auto; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 16px; background: var(--dsw-alias-bg-overlay); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24); color: var(--dsw-alias-label-primary); }
.mcpui-dialogHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.mcpui-dialogTitle { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; }
.mcpui-form { display: flex; flex-direction: column; gap: 10px; }
.mcpui-field { display: flex; flex-direction: column; gap: 4px; }
.mcpui-label { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.mcpui-hint { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
.mcpui-input, .mcpui-select, .mcpui-textarea { box-sizing: border-box; width: 100%; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px 10px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 18px; }
.mcpui-input:focus-visible, .mcpui-select:focus-visible, .mcpui-textarea:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.mcpui-textarea { min-height: 56px; resize: vertical; font-family: var(--ds-font-family-code); font-size: 12px; }
.mcpui-importText { min-height: 170px; }
.mcpui-check { align-items: center; }
.mcpui-check input { width: auto; margin: 0; }
.mcpui-input[readonly] { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
.mcpui-inline { display: flex; align-items: center; gap: 8px; }
.mcpui-inline > .mcpui-label { flex: 1; }
.mcpui-formError { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
.mcpui-dialogActions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.mcpui-readonlyIcon { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 26px; height: 26px; color: var(--dsw-alias-label-tertiary); }
@media (max-width: 768px) {
  .mcpui-cardRow { flex-wrap: wrap; }
  .mcpui-name { min-width: 72px; }
  .mcpui-actions { width: 100%; flex-wrap: wrap; justify-content: flex-end; }
}
`

    // ---------------------------------------------------------------- 小控件

    function Button(props) {
      const { children, onClick, variant, size, disabled, title, type, ariaLabel, solid } = props
      return h('button', {
        type: type ?? 'button',
        className: 'mcpui-btn',
        'data-variant': variant,
        'data-size': size,
        'data-solid': solid === true ? 'true' : undefined,
        'aria-label': ariaLabel,
        disabled: disabled === true,
        title,
        onClick: onClick,
      }, children)
    }

    function Pill(props) {
      return h('span', { className: 'mcpui-pill', 'data-tone': props.tone }, props.children)
    }

    function StateDot(props) {
      return h('span', { className: 'mcpui-dot', 'data-tone': props.tone ?? 'idle', 'aria-hidden': 'true' })
    }

    function Toggle(props) {
      const { checked, onChange, disabled, label } = props
      return h('button', {
        type: 'button',
        className: 'mcpui-switch',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        disabled: disabled === true,
        onClick: () => { onChange(!checked) },
      }, h('span', { className: 'mcpui-knob', 'aria-hidden': 'true' }))
    }

    /** 行内操作: 图标按钮, 可访问名与 tooltip 仍带完整文字。 */
    function IconButton(props) {
      const { label, tone, disabled, onClick, children } = props
      return h('button', {
        type: 'button',
        className: 'mcpui-btn mcpui-iconBtn',
        'data-tone': tone,
        'aria-label': label,
        title: label,
        disabled: disabled === true,
        onClick,
      }, children)
    }

    const ICON_PROPS = {
      viewBox: '0 0 16 16',
      width: 15,
      height: 15,
      'aria-hidden': 'true',
      focusable: 'false',
      style: { display: 'block' },
    }

    function IconPlay() {
      return h('svg', ICON_PROPS, h('path', { d: 'M5.6 3.9 12.2 8l-6.6 4.1z', fill: 'currentColor' }))
    }

    function IconSpinner() {
      return h('svg', ICON_PROPS, h('circle', {
        cx: 8,
        cy: 8,
        r: 5.2,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeDasharray: '20 14',
        strokeLinecap: 'round',
        className: 'mcpui-spin',
      }))
    }

    function IconRestart() {
      return h('svg', ICON_PROPS,
        h('path', {
          d: 'M12.4 8a4.4 4.4 0 1 1-1.3-3.1',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M12.6 2.9v3.2H9.4',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }))
    }

    function IconEdit() {
      return h('svg', ICON_PROPS,
        h('path', {
          d: 'M10.6 2.9 13.1 5.4 5.9 12.6H3.4V10.1z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M9.2 4.3l2.5 2.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }))
    }

    function IconTrash() {
      return h('svg', ICON_PROPS, h('path', {
        d: 'M3.2 4.6h9.6M6.3 4.6V2.9h3.4v1.7M4.7 4.6l.5 8.5h5.6l.5-8.5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function IconLock() {
      return h('svg', ICON_PROPS,
        h('rect', {
          x: 3.4, y: 7, width: 9.2, height: 6.4, rx: 1.4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
        }),
        h('path', {
          d: 'M5.6 7V5.4a2.4 2.4 0 0 1 4.8 0V7',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }))
    }

    function Field(props) {
      const { label, hint, children } = props
      // 用 <label> 包裹控件, 得到隐式可访问名 (无需为每个字段分配 id)。
      return h('label', { className: 'mcpui-field' },
        h('span', { className: 'mcpui-label' }, label),
        children,
        hint !== undefined ? h('span', { className: 'mcpui-hint' }, hint) : null)
    }

    function StatusIcon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
        h('rect', { x: 1.5, y: 2.5, width: 13, height: 4, rx: 1.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
        h('rect', { x: 1.5, y: 9.5, width: 13, height: 4, rx: 1.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
        h('circle', { cx: 4, cy: 4.5, r: 0.9, fill: 'currentColor' }),
        h('circle', { cx: 4, cy: 11.5, r: 0.9, fill: 'currentColor' }))
    }

    // ---------------------------------------------------------------- 状态文案

    /**
     * 探测状态 -> 按钮忙碌标志与结果面板。
     * 按钮只在 running 期间显示"测试中", 完成 (running=false) 后必须恢复;
     * 早先直接用 probe.name 判定, 导致一次探测后按钮永久停在"测试中…"。
     */
    function probeFlags(probe, name) {
      const active = probe !== null && probe !== undefined && probe.name === name
      return {
        probing: active && probe.running === true,
        result: active ? (probe.result ?? null) : null,
      }
    }

    /** 连接状态 -> 状态点颜色与文案 (不含来源/启用判定)。 */
    function statusFromState(status, t) {
      switch (status.state) {
        case 'connected':
          return { tone: 'ok', label: fill(t('statusConnected'), { n: status.toolCount }) }
        case 'connecting':
          return { tone: 'busy', label: fill(t('statusConnecting'), { n: status.attempt }) }
        case 'reconnecting':
          return {
            tone: 'warn',
            label: fill(t('statusReconnecting'), { n: status.attempt, max: status.maxAttempts }),
            detail: status.lastError,
          }
        case 'waiting-credentials':
          return { tone: 'warn', label: t('statusWaitingCredentials'), detail: status.lastError }
        case 'closed':
          return { tone: 'idle', label: t('statusClosed'), detail: status.result?.cleanupError }
        case 'failed': {
          if (status.reason === 'load') return { tone: 'error', label: t('statusLoadFailed'), detail: status.lastError }
          if (status.reason === 'cleanup') {
            return { tone: 'error', label: t('statusCleanupFailed'), detail: status.result?.cleanupError }
          }
          const labels = {
            'gave-up': t('statusGaveUp'),
            'reconnect-disabled': t('statusReconnectDisabled'),
            'unclosed-generation': t('statusUnclosed'),
          }
          return { tone: 'error', label: labels[status.reason] ?? String(status.reason), detail: status.lastError }
        }
        default:
          return { tone: 'idle', label: String(status.state) }
      }
    }

    function statusPresentation(server, t) {
      const status = server.status
      if (server.configured === false) {
        // 插件注册/待清理行: 有运行时状态就展示真实状态, 来源由 pill 表达。
        if (status === null || status === undefined) {
          return server.origin === 'stale'
            ? { tone: 'warn', label: t('statusStale') }
            : { tone: 'idle', label: t('statusRegistered') }
        }
        return statusFromState(status, t)
      }
      if (server.enabled === false) return { tone: 'idle', label: t('statusDisabled') }
      if (status === null || status === undefined) return { tone: 'idle', label: t('statusUnobserved') }
      return statusFromState(status, t)
    }

    function originKey(origin) {
      switch (origin) {
        case 'override': return 'originOverride'
        case 'inherited': return 'originInherited'
        case 'registered': return 'originRegistered'
        case 'stale': return 'originStale'
        default: return 'originUser'
      }
    }

    /** 命名空间解析失败原因 -> 用户可读文案 (原始值只留在宿主日志)。 */
    function namespaceReasonText(t, reason) {
      if (reason === 'mcp-manager-namespace-missing') return t('nsReasonMissing')
      if (reason === 'settings-describe-failed') return t('nsReasonDescribeFailed')
      return reason ?? 'unknown'
    }

    /** Loader fiber 阶段 -> 状态点颜色与文案键。 */
    function phasePresentation(phase, t) {
      switch (phase) {
        case 'active': return { tone: 'ok', label: t('phaseActive') }
        case 'failed': return { tone: 'error', label: t('phaseFailed') }
        case 'pending': return { tone: 'idle', label: t('phasePending') }
        case 'loading':
        case 'unloading': return { tone: 'busy', label: t(phase === 'loading' ? 'phaseLoading' : 'phaseUnloading') }
        default: return { tone: 'idle', label: t('phaseUnknown') }
      }
    }

    // ---------------------------------------------------------------- 表单转换

    const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

    function emptyDraft() {
      return {
        name: '',
        transport: 'stdio',
        command: '',
        argsText: '',
        envText: '',
        cwd: '',
        url: '',
        headersText: '',
        enabled: true,
        startupTimeoutMs: '',
        toolCallTimeoutMs: '',
        closeTimeoutMs: '',
        reconnectEnabled: true,
        advanced: false,
      }
    }

    function linesToArgs(text) {
      return text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    }

    function linesToRecord(text, label, t) {
      const out = {}
      const lines = text.split('\n')
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim()
        if (line.length === 0) continue
        const split = line.indexOf('=')
        if (split <= 0) return { ok: false, error: fill(t('kvInvalid'), { line: index + 1, label }) }
        out[line.slice(0, split).trim()] = line.slice(split + 1)
      }
      return { ok: true, value: out }
    }

    function recordToLines(record) {
      if (record === null || typeof record !== 'object') return ''
      return Object.entries(record).map(([key, value]) => `${key}=${value}`).join('\n')
    }

    function draftFromEntry(name, entry) {
      const draft = emptyDraft()
      draft.name = name
      draft.transport = entry?.transport === 'streamable-http' ? 'streamable-http' : 'stdio'
      draft.command = typeof entry?.command === 'string' ? entry.command : ''
      draft.argsText = Array.isArray(entry?.args) ? entry.args.join('\n') : ''
      draft.envText = recordToLines(entry?.env)
      draft.cwd = typeof entry?.cwd === 'string' ? entry.cwd : ''
      draft.url = typeof entry?.url === 'string' ? entry.url : ''
      draft.headersText = recordToLines(entry?.headers)
      draft.enabled = entry?.enabled !== false
      draft.startupTimeoutMs = entry?.startupTimeoutMs === undefined ? '' : String(entry.startupTimeoutMs)
      draft.toolCallTimeoutMs = entry?.toolCallTimeoutMs === undefined ? '' : String(entry.toolCallTimeoutMs)
      draft.closeTimeoutMs = entry?.closeTimeoutMs === undefined ? '' : String(entry.closeTimeoutMs)
      draft.reconnectEnabled = entry?.reconnect?.enabled !== false
      return draft
    }

    function parsePositive(text, label, t) {
      const trimmed = String(text ?? '').trim()
      if (trimmed.length === 0) return { ok: true, value: undefined }
      const number = Number(trimmed)
      if (!Number.isFinite(number) || number <= 0 || Math.floor(number) !== number) {
        return { ok: false, error: fill(t('numberInvalid'), { field: label }) }
      }
      return { ok: true, value: number }
    }

    function draftToEntry(draft, t) {
      if (!NAME_PATTERN.test(draft.name)) return { ok: false, error: t('nameInvalid') }
      const entry = { transport: draft.transport, enabled: draft.enabled }
      if (draft.transport === 'stdio') {
        const command = draft.command.trim()
        if (command.length === 0) return { ok: false, error: t('commandRequired') }
        entry.command = command
        const args = linesToArgs(draft.argsText)
        if (args.length > 0) entry.args = args
        const env = linesToRecord(draft.envText, 'env', t)
        if (!env.ok) return env
        if (Object.keys(env.value).length > 0) entry.env = env.value
        const cwd = draft.cwd.trim()
        if (cwd.length > 0) entry.cwd = cwd
      } else {
        const url = draft.url.trim()
        if (!/^https?:\/\//i.test(url)) return { ok: false, error: t('urlRequired') }
        entry.url = url
        const headers = linesToRecord(draft.headersText, 'headers', t)
        if (!headers.ok) return headers
        if (Object.keys(headers.value).length > 0) entry.headers = headers.value
      }
      const startup = parsePositive(draft.startupTimeoutMs, t('startupTimeout'), t)
      if (!startup.ok) return startup
      if (startup.value !== undefined) entry.startupTimeoutMs = startup.value
      const toolCall = parsePositive(draft.toolCallTimeoutMs, t('toolCallTimeout'), t)
      if (!toolCall.ok) return toolCall
      if (toolCall.value !== undefined) entry.toolCallTimeoutMs = toolCall.value
      const close = parsePositive(draft.closeTimeoutMs, t('closeTimeout'), t)
      if (!close.ok) return close
      if (close.value !== undefined) entry.closeTimeoutMs = close.value
      // 始终显式写入 enabled, 否则在原有 reconnect 为 false 时无法改回 true。
      entry.reconnect = { enabled: draft.reconnectEnabled !== false }
      return { ok: true, entry }
    }

    /**
     * 保存时的条目合并: 同 transport 下保留表单没有建模的字段
     * (例如 reconnect 的 initialDelayMs/maxDelayMs/maxAttempts), 避免整条覆盖时丢配置;
     * 表单建模的字段以草稿为准 —— 草稿里没有就表示用户清空了它, 不能从 base 复活。
     * 切换 transport 时按新条目重建, 不留跨传输字段。
     */
    const MODELED_FIELDS = [
      'transport', 'command', 'args', 'env', 'cwd', 'url', 'headers', 'enabled',
      'startupTimeoutMs', 'toolCallTimeoutMs', 'closeTimeoutMs', 'reconnect',
    ]

    function mergeForSave(base, entry) {
      if (base === null || typeof base !== 'object' || base.transport !== entry.transport) return entry
      const merged = { ...base, ...entry }
      for (const field of MODELED_FIELDS) {
        if (!(field in entry)) delete merged[field]
      }
      if (base.reconnect !== undefined || entry.reconnect !== undefined) {
        merged.reconnect = { ...(base.reconnect ?? {}), ...(entry.reconnect ?? {}) }
      }
      return merged
    }

    /**
     * 解析"从 JSON 导入"的文本。支持:
     *   { name, transport, ... }                    单个服务器
     *   [ { name, transport, ... }, ... ]           数组
     *   { servers: { name: { transport, ... } } }   config.servers 映射
     *   { name: { transport, ... }, ... }           裸映射
     * name 从条目里取出, 不作为 entry 字段交给宿主。
     * @returns {{ok: true, items: Array<{name: string, entry: object}>} | {ok: false, error: 'json'|'shape'|'name'|'empty', message?: string}}
     */
    function parseImport(text) {
      let value
      try {
        value = JSON.parse(text)
      } catch (error) {
        return { ok: false, error: 'json', message: error instanceof Error ? error.message : String(error) }
      }
      const items = []
      const push = (name, entry) => {
        if (typeof name !== 'string' || name.trim().length === 0) return false
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false
        items.push({ name: name.trim(), entry })
        return true
      }
      const pushEntryMap = (map) => {
        for (const [name, entry] of Object.entries(map)) {
          if (!push(name, entry)) return false
        }
        return true
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item === null || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: 'shape' }
          const { name, ...entry } = item
          if (typeof name !== 'string') return { ok: false, error: 'name' }
          if (!push(name, entry)) return { ok: false, error: 'name' }
        }
      } else if (value !== null && typeof value === 'object') {
        if (typeof value.transport === 'string') {
          const { name, ...entry } = value
          if (typeof name !== 'string' || !push(name, entry)) return { ok: false, error: 'name' }
        } else if (value.servers !== null && typeof value.servers === 'object' && !Array.isArray(value.servers)) {
          if (!pushEntryMap(value.servers)) return { ok: false, error: 'shape' }
        } else if (!pushEntryMap(value)) {
          return { ok: false, error: 'shape' }
        }
      } else {
        return { ok: false, error: 'shape' }
      }

      if (items.length === 0) return { ok: false, error: 'empty' }
      return { ok: true, items }
    }

    function importErrorText(t, result) {
      if (result.error === 'json') return fill(t('importBadJson'), { message: result.message ?? '' })
      if (result.error === 'shape') return t('importBadShape')
      if (result.error === 'name') return t('importBadName')
      return t('importEmpty')
    }

    // ---------------------------------------------------------------- 对话框

    function Dialog(props) {
      const { title, children, onClose, closeLabel } = props
      const panelRef = useRef(null)
      const closeRef = useRef(onClose)
      closeRef.current = onClose
      const restoreRef = useRef(null)

      // 只跑一次: 记住触发元素、聚焦首个字段、Escape 关闭、Tab 循环、卸载时还原焦点。
      // 不能依赖 onClose —— 页面轮询会重建回调, 那会每 2.5 秒把焦点抢回关闭按钮。
      useEffect(() => {
        const panel = panelRef.current
        restoreRef.current = document.activeElement
        const firstField = panel?.querySelector('input:not([readonly]), textarea, select')
        const target = firstField ?? panel?.querySelector('button')
        if (target !== null && target !== undefined && typeof target.focus === 'function') target.focus()

        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            closeRef.current()
            return
          }
          if (event.key !== 'Tab' || panel === null || panel === undefined) return
          const focusables = [...panel.querySelectorAll('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])')]
            .filter(element => element.disabled !== true && element.offsetParent !== null)
          if (focusables.length === 0) return
          const first = focusables[0]
          const last = focusables[focusables.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('keydown', onKey, true)
          const restore = restoreRef.current
          if (restore !== null && restore !== undefined && typeof restore.focus === 'function') restore.focus()
        }
      }, [])
      return h('div', {
        className: 'mcpui-overlay',
        onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() },
      }, h('div', {
        className: 'mcpui-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        ref: panelRef,
      }, h('div', { className: 'mcpui-dialogHead' },
        h('h3', { className: 'mcpui-dialogTitle' }, title),
        h(Button, { size: 'sm', onClick: onClose, ariaLabel: closeLabel, title: closeLabel }, '×')),
      children))
    }

    function ServerForm(props) {
      const { dialog, t, saving, error, onCancel, onSubmit } = props
      const [draft, setDraft] = useState(() => (dialog.kind === 'edit'
        ? draftFromEntry(dialog.server.name, dialog.server.config)
        : emptyDraft()))
      const [localError, setLocalError] = useState(null)
      const isEdit = dialog.kind === 'edit'
      const isRegistered = dialog.server !== undefined && dialog.server.configured === false
      const base = isEdit && dialog.server.config !== null && typeof dialog.server.config === 'object'
        ? dialog.server.config
        : null
      const update = (patch) => { setDraft({ ...draft, ...patch }) }

      const submit = (event) => {
        event.preventDefault()
        const parsed = draftToEntry(draft, t)
        if (!parsed.ok) {
          setLocalError(parsed.error)
          return
        }
        setLocalError(null)
        onSubmit(mergeForSave(base, parsed.entry), draft.name)
      }

      return h(Dialog, { title: isEdit ? t('editTitle') : t('addTitle'), onClose: saving ? () => {} : onCancel, closeLabel: t('close') },
        h('form', { className: 'mcpui-form', onSubmit: submit },
          isRegistered
            ? h('p', { className: 'mcpui-formError' }, t('readOnlyRegistered'))
            : null,
          h(Field, { label: t('name'), hint: isEdit ? undefined : t('nameHint') },
            h('input', {
              className: 'mcpui-input',
              value: draft.name,
              readOnly: isEdit,
              'aria-readonly': isEdit ? 'true' : 'false',
              onChange: (event) => { update({ name: event.target.value }) },
            })),
          h(Field, { label: t('transport') },
            h('select', {
              className: 'mcpui-select',
              value: draft.transport,
              onChange: (event) => { update({ transport: event.target.value }) },
            },
            h('option', { value: 'stdio' }, t('transportStdio')),
            h('option', { value: 'streamable-http' }, t('transportHttp')))),
          draft.transport === 'stdio'
            ? h(React.Fragment, null,
              h(Field, { label: t('command') },
                h('input', {
                  className: 'mcpui-input',
                  value: draft.command,
                  spellCheck: false,
                  onChange: (event) => { update({ command: event.target.value }) },
                })),
              h(Field, { label: t('args') },
                h('textarea', {
                  className: 'mcpui-textarea',
                  value: draft.argsText,
                  spellCheck: false,
                  onChange: (event) => { update({ argsText: event.target.value }) },
                })),
              h(Field, { label: t('env'), hint: t('secretHint') },
                h('textarea', {
                  className: 'mcpui-textarea',
                  value: draft.envText,
                  spellCheck: false,
                  onChange: (event) => { update({ envText: event.target.value }) },
                })),
              h(Field, { label: t('cwd') },
                h('input', {
                  className: 'mcpui-input',
                  value: draft.cwd,
                  spellCheck: false,
                  onChange: (event) => { update({ cwd: event.target.value }) },
                })))
            : h(React.Fragment, null,
              h(Field, { label: t('url') },
                h('input', {
                  className: 'mcpui-input',
                  value: draft.url,
                  spellCheck: false,
                  onChange: (event) => { update({ url: event.target.value }) },
                })),
              h(Field, { label: t('headers'), hint: t('secretHint') },
                h('textarea', {
                  className: 'mcpui-textarea',
                  value: draft.headersText,
                  spellCheck: false,
                  onChange: (event) => { update({ headersText: event.target.value }) },
                }))),
          h('div', { className: 'mcpui-inline' },
            h('span', { className: 'mcpui-label' }, t('enable')),
            h(Toggle, {
              checked: draft.enabled,
              label: t('enable'),
              onChange: (next) => { update({ enabled: next }) },
            })),
          h('button', {
            type: 'button',
            className: 'mcpui-btn',
            'data-size': 'sm',
            onClick: () => { update({ advanced: !draft.advanced }) },
            style: { alignSelf: 'flex-start' },
          }, `${draft.advanced ? '▾' : '▸'} ${t('advanced')}`),
          draft.advanced
            ? h(React.Fragment, null,
              h(Field, { label: t('startupTimeout') },
                h('input', {
                  className: 'mcpui-input',
                  inputMode: 'numeric',
                  value: draft.startupTimeoutMs,
                  onChange: (event) => { update({ startupTimeoutMs: event.target.value }) },
                })),
              h(Field, { label: t('toolCallTimeout') },
                h('input', {
                  className: 'mcpui-input',
                  inputMode: 'numeric',
                  value: draft.toolCallTimeoutMs,
                  onChange: (event) => { update({ toolCallTimeoutMs: event.target.value }) },
                })),
              h(Field, { label: t('closeTimeout') },
                h('input', {
                  className: 'mcpui-input',
                  inputMode: 'numeric',
                  value: draft.closeTimeoutMs,
                  onChange: (event) => { update({ closeTimeoutMs: event.target.value }) },
                })),
              h('div', { className: 'mcpui-inline' },
                h('span', { className: 'mcpui-label' }, t('reconnect')),
                h(Toggle, {
                  checked: draft.reconnectEnabled,
                  label: t('reconnect'),
                  onChange: (next) => { update({ reconnectEnabled: next }) },
                })))
            : null,
          localError !== null || error !== null
            ? h('p', { className: 'mcpui-formError', role: 'alert' }, localError ?? error)
            : null,
          h('div', { className: 'mcpui-dialogActions' },
            h(Button, { onClick: onCancel, disabled: saving }, t('cancel')),
            h(Button, { variant: 'primary', type: 'submit', disabled: saving }, saving ? t('saving') : t('save')))))
    }

    // ---------------------------------------------------------------- 页面

    /** 从 JSON 粘贴导入: 解析、预览、原子写入。 */
    function ImportDialog(props) {
      const { t, configured, unmanaged, saving, error, onCancel, onImport } = props
      const [text, setText] = useState('')
      const [overwrite, setOverwrite] = useState(false)
      const [localError, setLocalError] = useState(null)

      const trimmed = text.trim()
      const parsed = trimmed.length === 0 ? null : parseImport(trimmed)
      const parseError = parsed !== null && parsed.ok === false ? importErrorText(t, parsed) : null
      const preview = parsed !== null && parsed.ok
        ? fill(t('importPreview'), { n: parsed.items.length, names: parsed.items.map(item => item.name).join(', ') })
        : null
      // 静态挂载的客户端占用 serverName: 同名导入不会覆盖它, 受管实例反而会挂载失败。
      const staticNames = new Set(
        (Array.isArray(unmanaged) ? unmanaged : []).map(client => client.serverName).filter(name => typeof name === 'string' && name !== ''),
      )
      const staticConflicts = parsed !== null && parsed.ok
        ? parsed.items.map(item => item.name).filter(name => staticNames.has(name))
        : []
      const shownError = localError ?? parseError ?? error

      const fillCurrent = () => {
        const servers = {}
        for (const server of configured) {
          if (server.config !== null && typeof server.config === 'object') servers[server.name] = server.config
        }
        setText(JSON.stringify({ servers }, null, 2))
        setLocalError(null)
      }

      const submit = (event) => {
        event.preventDefault()
        if (parsed === null) {
          setLocalError(t('importEmpty'))
          return
        }
        if (parsed.ok === false) {
          setLocalError(importErrorText(t, parsed))
          return
        }
        setLocalError(null)
        onImport(parsed.items, overwrite)
      }

      return h(Dialog, { title: t('importTitle'), onClose: saving ? () => {} : onCancel, closeLabel: t('close') },
        h('form', { className: 'mcpui-form', onSubmit: submit },
          h('textarea', {
            className: 'mcpui-textarea mcpui-importText',
            value: text,
            spellCheck: false,
            placeholder: t('importExample'),
            'aria-label': t('importJson'),
            onChange: (event) => { setText(event.target.value); setLocalError(null) },
          }),
          h('span', { className: 'mcpui-hint' }, t('importHint')),
          h('label', { className: 'mcpui-inline mcpui-check' },
            h('input', {
              type: 'checkbox',
              checked: overwrite,
              onChange: (event) => { setOverwrite(event.target.checked) },
            }),
            h('span', { className: 'mcpui-label' }, t('importOverwrite'))),
          preview !== null ? h('span', { className: 'mcpui-note' }, preview) : null,
          staticConflicts.length > 0
            ? h('p', { className: 'mcpui-note mcpui-warn', role: 'status' },
              fill(t('importStaticConflict'), { names: staticConflicts.join(', ') }))
            : null,
          h('span', { className: 'mcpui-hint' }, t('importNote')),
          shownError !== null ? h('p', { className: 'mcpui-formError', role: 'alert' }, shownError) : null,
          h('div', { className: 'mcpui-dialogActions' },
            h(Button, { onClick: fillCurrent, disabled: saving }, t('importFill')),
            h(Button, { onClick: onCancel, disabled: saving }, t('cancel')),
            h(Button, { variant: 'primary', type: 'submit', disabled: saving }, saving ? t('saving') : t('importSubmit')))))
    }

    function McpPage(props) {
      const { t, useLocaleTick, close } = props
      useLocaleTick()

      const [data, setData] = useState(null)
      const [loadError, setLoadError] = useState(null)
      const [loading, setLoading] = useState(true)
      const [refreshing, setRefreshing] = useState(false)
      const [notice, setNotice] = useState(null)
      const [busy, setBusy] = useState(null)
      const [expanded, setExpanded] = useState({})
      const [probe, setProbe] = useState(null)
      const [dialog, setDialog] = useState(null)
      const [dialogError, setDialogError] = useState(null)
      const [saving, setSaving] = useState(false)
      const aliveRef = useRef(true)

      const reload = useCallback(async (announce = false) => {
        if (announce) setRefreshing(true)
        try {
          const next = await api.state()
          if (!aliveRef.current) return
          setData(next)
          setLoadError(null)
        } catch (error) {
          if (!aliveRef.current) return
          setLoadError(formatError(t, error))
        } finally {
          if (aliveRef.current) {
            setLoading(false)
            setRefreshing(false)
          }
        }
      }, [t])

      const dialogOpen = dialog !== null

      useEffect(() => {
        aliveRef.current = true
        reload()
        // 对话框打开期间暂停轮询: 重渲染不得打断表单输入或抢走焦点。
        if (dialogOpen) {
          return () => { aliveRef.current = false }
        }
        const timer = setInterval(() => {
          if (document.visibilityState === 'visible') reload()
        }, POLL_MS)
        return () => {
          aliveRef.current = false
          clearInterval(timer)
        }
      }, [reload, dialogOpen])

      useEffect(() => {
        if (notice === null || notice.tone !== 'ok') return undefined
        const timer = setTimeout(() => { setNotice(null) }, 4000)
        return () => { clearTimeout(timer) }
      }, [notice])

      const servers = data?.servers ?? []
      const configured = servers.filter(server => server.configured)
      const connected = configured.filter(server => server.status?.state === 'connected').length
      const services = data?.services
      const namespace = data?.namespace
      const settingsReady = services?.settings === true
      const managerReady = services?.manager === true
      const namespaceReady = namespace !== undefined && namespace.id !== null
      const writable = settingsReady && managerReady && namespaceReady
      /** 行级忙碌: 只有该服务器自己的动作在跑时禁用它的控件。 */
      const rowBusy = name => busy === `toggle:${name}` || busy === `probe:${name}` || busy === `restart:${name}`

      const run = async (key, body, successText) => {
        setBusy(key)
        setNotice(null)
        try {
          const result = await api.act(body)
          if (successText !== null) setNotice({ tone: 'ok', text: successText })
          await reload()
          return result
        } catch (error) {
          setNotice({ tone: 'error', text: fill(t('actionError'), { message: formatError(t, error) }) })
          return null
        } finally {
          setBusy(null)
        }
      }

      const onToggle = async (server, next) => {
        await run(
          `toggle:${server.name}`,
          { action: next ? 'enable' : 'disable', name: server.name },
          fill(next ? t('enabledNotice') : t('disabledNotice'), { name: server.name }),
        )
      }

      const onProbe = async (server) => {
        // 结果展示在展开区, 所以先展开卡片。
        setExpanded(previous => ({ ...previous, [server.name]: true }))
        setProbe({ name: server.name, running: true, result: null })
        const response = await run(`probe:${server.name}`, { action: 'probe', name: server.name }, null)
        if (response !== null) setProbe({ name: server.name, running: false, result: response.result })
        else setProbe(null)
      }

      const onRestart = async (server) => {
        await run(`restart:${server.name}`, { action: 'restart', name: server.name }, fill(t('restarted'), { name: server.name }))
      }

      /** 保存/新增: 名称来自表单 (编辑时固定为原名称)。 */
      const submitEntry = async (kind, name, entry) => {
        setSaving(true)
        setDialogError(null)
        try {
          await api.act({ action: kind === 'edit' ? 'save' : 'add', name, entry })
          setDialog(null)
          setNotice({ tone: 'ok', text: fill(kind === 'edit' ? t('saved') : t('added'), { name }) })
          await reload()
        } catch (error) {
          setDialogError(formatError(t, error))
        } finally {
          setSaving(false)
        }
      }

      /** JSON 批量导入: 宿主一次写入, 成功后刷新。 */
      const submitImport = async (items, overwrite) => {
        setSaving(true)
        setDialogError(null)
        try {
          const result = await api.act({ action: 'import', entries: items, overwrite })
          setDialog(null)
          setNotice({
            tone: 'ok',
            text: fill(t(overwrite ? 'importedOverwrite' : 'imported'), { n: result.imported }),
          })
          await reload()
        } catch (error) {
          setDialogError(formatError(t, error))
        } finally {
          setSaving(false)
        }
      }

      const onDelete = async (server) => {
        setSaving(true)
        setDialogError(null)
        try {
          await api.act({ action: 'delete', name: server.name })
          setDialog(null)
          setNotice({ tone: 'ok', text: fill(t('deleted'), { name: server.name }) })
          await reload()
        } catch (error) {
          setDialogError(formatError(t, error))
        } finally {
          setSaving(false)
        }
      }

      const toggleExpanded = (name) => {
        setExpanded({ ...expanded, [name]: !expanded[name] })
      }

      return h('div', { className: 'mcpui-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'mcpui-head' },
          h('div', { className: 'mcpui-headings' },
            h('h3', { className: 'mcpui-title' }, t('title')),
            h('p', { className: 'mcpui-subtitle' }, fill(t('subtitle'), { n: configured.length, connected })),
            h('p', { className: 'mcpui-hint' }, t('scope'))),
          h('div', { className: 'mcpui-headActions' },
            h(Button, {
              size: 'sm',
              onClick: () => { reload(true) },
              disabled: loading || refreshing,
            }, refreshing ? t('loading') : t('refresh')),
            h(Button, {
              size: 'sm',
              onClick: () => { setDialogError(null); setDialog({ kind: 'import' }) },
              disabled: !writable,
            }, t('importJson')),
            h(Button, {
              size: 'sm',
              variant: 'primary',
              onClick: () => { setDialogError(null); setDialog({ kind: 'add' }) },
              disabled: !writable,
            }, t('add')))),

        notice !== null
          ? h('p', {
            className: 'mcpui-notice',
            'data-tone': notice.tone,
            role: notice.tone === 'error' ? 'alert' : 'status',
          }, notice.text)
          : null,

        services !== undefined && services.manager !== true
          ? h('div', { className: 'mcpui-banner' }, h('strong', null, t('missingManager')))
          : null,

        services !== undefined && services.settings !== true
          ? h('div', { className: 'mcpui-banner' }, h('strong', null, t('missingSettings')))
          : null,

        namespace !== undefined && namespace.id === null && services?.settings === true
          ? h('div', { className: 'mcpui-banner' },
            h('strong', null, fill(t('missingNamespace'), { reason: namespaceReasonText(t, namespace.reason) })))
          : null,

        loadError !== null
          ? h('p', { className: 'mcpui-notice', 'data-tone': 'error', role: 'alert' },
            fill(t('loadError'), { message: loadError }),
            ' ',
            h(Button, { size: 'sm', onClick: () => { reload(true) } }, t('reload')))
          : null,

        loading && data === null
          ? h('p', { className: 'mcpui-note' }, t('loading'))
          : null,

        !loading && servers.length === 0 && loadError === null
          ? h('div', { className: 'mcpui-empty' },
            h('strong', null, t('empty')),
            h('span', { className: 'mcpui-note' }, t('emptyHint')),
            data?.unmanaged !== undefined && data.unmanaged.length > 0
              ? h('span', { className: 'mcpui-note' }, t('emptyUnmanaged'))
              : null)
          : null,

        h('ul', { className: 'mcpui-cards' },
          servers.map((server) => {
            const status = statusPresentation(server, t)
            const open = expanded[server.name] === true
            const probeState = probeFlags(probe, server.name)
            const probing = probeState.probing
            const readOnly = server.configured === false
            const removable = !readOnly && (server.origin === 'user' || server.origin === 'override')
            const busyRow = rowBusy(server.name)
            return h('li', {
              key: server.name,
              className: 'mcpui-card',
              'data-open': open ? 'true' : 'false',
              'aria-busy': busyRow ? 'true' : undefined,
            },
            h('div', { className: 'mcpui-cardRow' },
              h('button', {
                type: 'button',
                className: 'mcpui-main',
                'aria-expanded': open,
                onClick: () => { toggleExpanded(server.name) },
              },
              h('span', { className: 'mcpui-chevron', 'aria-hidden': 'true' }, '▾'),
              h(StateDot, { tone: status.tone }),
              h('span', { className: 'mcpui-name', title: server.name }, server.name),
              server.transport !== '' ? h(Pill, null, server.transport) : null,
              h(Pill, { tone: server.origin === 'stale' ? 'warn' : undefined }, t(originKey(server.origin))),
              h('span', { className: 'mcpui-state', 'data-tone': status.tone }, status.label)),
              h('span', { className: 'mcpui-actions' },
                readOnly
                  ? h('span', {
                    className: 'mcpui-readonlyIcon',
                    role: 'img',
                    'aria-label': t('readOnlyRegistered'),
                    title: t('readOnlyRegistered'),
                  }, h(IconLock))
                  : h(Toggle, {
                    checked: server.enabled,
                    disabled: !writable || busyRow,
                    label: fill(t('toggleLabel'), { name: server.name }),
                    onChange: (next) => { onToggle(server, next) },
                  }),
                h(IconButton, {
                  label: probing ? `${t('testing')} ${server.name}` : `${t('test')} ${server.name}`,
                  disabled: !managerReady || busyRow,
                  onClick: () => { onProbe(server) },
                }, probing ? h(IconSpinner) : h(IconPlay)),
                h(IconButton, {
                  label: `${t('restart')} ${server.name}`,
                  disabled: !managerReady || readOnly || server.enabled === false || busyRow,
                  onClick: () => { onRestart(server) },
                }, h(IconRestart)),
                h(IconButton, {
                  label: `${t('edit')} ${server.name}`,
                  disabled: !writable || readOnly || busyRow,
                  onClick: () => { setDialogError(null); setDialog({ kind: 'edit', server }) },
                }, h(IconEdit)),
                h(IconButton, {
                  label: `${t('delete')} ${server.name}`,
                  tone: 'danger',
                  disabled: !writable || !removable || busyRow,
                  onClick: () => { setDialogError(null); setDialog({ kind: 'delete', server }) },
                }, h(IconTrash)))),
            open
              ? h('div', { className: 'mcpui-details' },
                readOnly
                  ? h('span', { className: 'mcpui-note' }, t('readOnlyRegistered'))
                  : null,
                server.summary !== ''
                  ? h('div', { className: 'mcpui-kv' },
                    h('span', { className: 'mcpui-kvKey' }, t(server.transport === 'streamable-http' ? 'endpoint' : 'command')),
                    h('span', { className: 'mcpui-kvValue' }, server.summary))
                  : null,
                server.origin === 'inherited'
                  ? h('span', { className: 'mcpui-note' }, t('inheritedHint'))
                  : null,
                status.detail !== undefined && status.detail !== null && status.detail !== ''
                  ? h('div', { className: 'mcpui-kv' },
                    h('span', { className: 'mcpui-kvKey' }, t('lastError')),
                    h('span', { className: 'mcpui-kvValue mcpui-error', 'data-plain': 'true' }, status.detail))
                  : null,
                server.secrets.length > 0
                  ? h('div', { className: 'mcpui-kv' },
                    h('span', { className: 'mcpui-kvKey' }, t('secretMasked')),
                    h('span', { className: 'mcpui-kvValue' }, server.secrets.join(', ')))
                  : null,
                server.config?.args !== undefined && server.config.args.length > 0
                  ? h('div', { className: 'mcpui-kv' },
                    h('span', { className: 'mcpui-kvKey' }, t('argsDetail')),
                    h('span', { className: 'mcpui-kvValue' }, server.config.args.join(' ')))
                  : null,
                server.config?.env !== undefined
                  ? h('div', { className: 'mcpui-kv' },
                    h('span', { className: 'mcpui-kvKey' }, t('envDetail')),
                    h('span', { className: 'mcpui-kvValue' }, Object.keys(server.config.env).join(', ') || t('none')))
                  : null,
                server.config?.headers !== undefined
                  ? h('div', { className: 'mcpui-kv' },
                    h('span', { className: 'mcpui-kvKey' }, t('headersDetail')),
                    h('span', { className: 'mcpui-kvValue' }, Object.keys(server.config.headers).join(', ') || t('none')))
                  : null,
                probing
                  ? h('span', { className: 'mcpui-note' }, t('testing'))
                  : null,
                probeState.result !== null
                  ? h(ProbeResult, { result: probeState.result, t })
                  : null)
              : null)
          })),

        data?.unmanaged !== undefined && data.unmanaged.length > 0
          ? h('div', null,
            h('div', { className: 'mcpui-headings mcpui-subhead' },
              h('h3', { className: 'mcpui-title' }, t('unmanagedTitle')),
              h('p', { className: 'mcpui-note' }, t('unmanagedHint'))),
            h('ul', { className: 'mcpui-cards' },
              data.unmanaged.map((client) => {
                const phase = phasePresentation(client.phase, t)
                return h('li', { key: client.id, className: 'mcpui-card' },
                  h('div', { className: 'mcpui-cardRow' },
                    h('span', { className: 'mcpui-main', style: { cursor: 'default' } },
                      h(StateDot, { tone: client.enabled ? phase.tone : 'idle' }),
                      h('span', { className: 'mcpui-name', title: client.id }, client.serverName !== '' ? client.serverName : client.id),
                      client.transport !== '' ? h(Pill, null, client.transport) : null,
                      h(Pill, { tone: 'warn' }, t('originStatic'))),
                    h('span', { className: 'mcpui-actions' },
                      h('span', { className: 'mcpui-state' },
                        client.enabled ? phase.label : t('off')))))
              })))
          : null,

        h('p', { className: 'mcpui-note' }, t('configNote')),

        dialog !== null && dialog.kind === 'delete'
          ? h(Dialog, { title: t('deleteTitle'), onClose: saving ? () => {} : () => { setDialog(null) }, closeLabel: t('close') },
            h('div', { className: 'mcpui-form' },
              h('p', { className: 'mcpui-note' }, dialog.server.origin === 'override'
                ? fill(t('deleteConfirmOverride'), { name: dialog.server.name })
                : fill(t('deleteConfirm'), { name: dialog.server.name })),
              dialogError !== null ? h('p', { className: 'mcpui-formError', role: 'alert' }, dialogError) : null,
              h('div', { className: 'mcpui-dialogActions' },
                h(Button, { onClick: () => { setDialog(null) }, disabled: saving }, t('cancel')),
                h(Button, { variant: 'danger', solid: true, disabled: saving, onClick: () => { onDelete(dialog.server) } }, t('confirmDelete')))))
          : null,

        dialog !== null && dialog.kind === 'import'
          ? h(ImportDialog, {
            t,
            configured,
            unmanaged: data?.unmanaged ?? [],
            saving,
            error: dialogError,
            onCancel: () => { setDialog(null); setDialogError(null) },
            onImport: (items, overwrite) => { submitImport(items, overwrite) },
          })
          : null,

        dialog !== null && (dialog.kind === 'add' || dialog.kind === 'edit')
          ? h(ServerForm, {
            dialog,
            t,
            saving,
            error: dialogError,
            onCancel: () => { setDialog(null); setDialogError(null) },
            onSubmit: (entry, draftName) => {
              submitEntry(dialog.kind, dialog.kind === 'edit' ? dialog.server.name : draftName, entry)
            },
          })
          : null,
      )
    }

    function ProbeResult(props) {
      const { result, t } = props
      const ok = result?.ok === true
      const allTools = Array.isArray(result?.toolNames) ? result.toolNames : []
      const shownTools = allTools.slice(0, 20)
      const hiddenTools = allTools.length - shownTools.length
      return h('div', { className: 'mcpui-probe' },
        h('div', { className: 'mcpui-inline' },
          h(StateDot, { tone: ok ? 'ok' : 'error' }),
          h('strong', { style: { fontSize: '12px' } }, `${t('probeTitle')}: ${ok ? t('probeOk') : t('probeFail')}`),
          h('span', { className: 'mcpui-note' }, fill(t('probeDuration'), { ms: result?.durationMs ?? 0 }))),
        ok
          ? h(React.Fragment, null,
            result.serverInfo !== undefined
              ? h('div', { className: 'mcpui-kv' },
                h('span', { className: 'mcpui-kvKey' }, t('probeServer')),
                h('span', { className: 'mcpui-kvValue' }, `${result.serverInfo.name} ${result.serverInfo.version}`))
              : null,
            h('div', { className: 'mcpui-kv' },
              h('span', { className: 'mcpui-kvKey' }, t('probeTools')),
              h('span', { className: 'mcpui-kvValue' }, `${allTools.length}${result.truncated ? ` ${t('probeTruncated')}` : ''}`)),
            shownTools.length > 0
              ? h('div', { className: 'mcpui-chips' },
                shownTools.map(tool => h('span', { key: tool, className: 'mcpui-chip' }, tool)),
                hiddenTools > 0
                  ? h('span', { className: 'mcpui-chip' }, fill(t('probeMore'), { n: hiddenTools }))
                  : null)
              : null)
          : h('div', { className: 'mcpui-kv' },
            h('span', { className: 'mcpui-kvKey' }, t('probeStage')),
            h('span', { className: 'mcpui-kvValue' }, String(result?.stage ?? 'connect'))),
        !ok
          ? h('div', { className: 'mcpui-kv' },
            h('span', { className: 'mcpui-kvKey' }, t('lastError')),
            h('span', { className: 'mcpui-kvValue mcpui-error', 'data-plain': 'true' }, String(result?.message ?? '')))
          : null,
        h('div', { className: 'mcpui-kv' },
          h('span', { className: 'mcpui-kvKey' }, t('probeCleanup')),
          h('span', { className: 'mcpui-kvValue', 'data-plain': 'true' },
            result?.closeConfirmed === false
              ? fill(t('probeCleanupFail'), { message: result?.cleanupError ?? '' })
              : t('probeCleanupOk'))))
    }

    function McpIcon(props) {
      const size = props?.size ?? 20
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 20 20',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      },
      h('rect', { x: 2.2, y: 3.2, width: 15.6, height: 5, rx: 1.4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }),
      h('rect', { x: 2.2, y: 11.8, width: 15.6, height: 5, rx: 1.4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }),
      h('circle', { cx: 5, cy: 5.7, r: 1.05, fill: 'currentColor' }),
      h('circle', { cx: 5, cy: 14.3, r: 1.05, fill: 'currentColor' }))
    }

    // ---------------------------------------------------------------- 注册

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mcp-ui: dictionaries')
      const t = ctx.locale.bind(NS)

      // 语言切换时重新渲染页面 (label 由 shell 每次投影时重新读取)。
      const subscribeLocale = (listener) => ctx.locale.subscribe(listener)
      function useLocaleTick() {
        const [, force] = useState(0)
        useEffect(() => subscribeLocale(() => { force(value => value + 1) }), [])
      }

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'mcp',
        order: 12,
        label: () => t('section'),
      }, (props) => h(McpPage, { t, useLocaleTick, close: props?.close })))

      ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
        name: 'settings.section.icon',
        id: 'mcp',
      }, McpIcon))
    }

    return {
      name: 'mcp-ui',
      inject: ['slots', 'locale'],
      apply,
      /** 仅供 node 侧测试使用的纯函数/组件钩子 (不参与运行时注册)。 */
      __test: {
        emptyDraft,
        draftFromEntry,
        draftToEntry,
        mergeForSave,
        linesToRecord,
        parseImport,
        probeFlags,
        CSS,
        IconButton,
        IconPlay,
        IconSpinner,
        IconRestart,
        IconEdit,
        IconTrash,
        IconLock,
      },
    }
  },
})
