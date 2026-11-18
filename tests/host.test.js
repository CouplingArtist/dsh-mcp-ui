/**
 * 宿主侧单元/接口测试: 纯校验函数 + HTTP 处理器。
 * 不启动 Harness、不触碰真实 profile: settings / mcpManager 都是注入的假实现。
 * 运行: node --test tests/
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { createApiHandler } from '../lib/host/api.js'
import { collectServers, normalizeEntry, secretPathsByServer, summarizeEntry } from '../lib/host/servers.js'
import { resolveManagerNamespace, schemaHasServers } from '../lib/host/namespace.js'

// --------------------------------------------------------------- 测试替身

function applyOp(target, op) {
  const path = [...op.path]
  const last = path.pop()
  let cursor = target
  for (const key of path) {
    if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {}
    cursor = cursor[key]
  }
  if (op.op === 'unset') delete cursor[last]
  else cursor[last] = op.value
}

function createSettings(initial) {
  const state = { value: JSON.parse(JSON.stringify(initial)), revision: 1, calls: [] }
  return {
    state,
    describe: () => [{
      ns: 'mcp-manager',
      autoGenerate: false,
      schema: { type: 'object', properties: { servers: { type: 'object' } } },
      value: state.value,
      revision: state.revision,
      base: {},
      user: JSON.parse(JSON.stringify(state.value)),
    }],
    async mutate(ns, ops, expectedRevision) {
      state.calls.push({ ns, ops, expectedRevision })
      if (expectedRevision !== state.revision) throw new Error('settings-conflict: revision changed')
      for (const op of ops) applyOp(state.value, op)
      state.revision += 1
    },
  }
}

function createManager(overrides = {}) {
  return {
    list: () => [
      { name: 'pencil', configured: true, status: { state: 'connected', toolCount: 3, connectedAt: 1 } },
      { name: 'plugin-owned', configured: true, status: { state: 'closed', result: { closeConfirmed: true } } },
    ],
    probe: async () => ({ ok: true, toolNames: ['ping'], truncated: false, durationMs: 12, closeConfirmed: true }),
    restart: async () => {},
    ...overrides,
  }
}

function createDeps({ settings, manager, configEditor, loader, isLocal } = {}) {
  const services = new Map()
  if (settings !== undefined) services.set('settings', settings)
  if (manager !== undefined) services.set('mcpManager', manager)
  if (configEditor !== undefined) services.set('configEditor', configEditor)
  if (loader !== undefined) services.set('loader', loader)
  return {
    get: name => services.get(name),
    isLocal: isLocal ?? (() => true),
    logger: { warn() {} },
  }
}

function createLoader() {
  return {
    entries: () => [
      {
        id: 'include:rea-mcp',
        options: {
          id: 'rea-mcp',
          name: '@deepseek-ai/dsh-mcp-client',
          config: {
            serverName: 'rea',
            transport: 'streamable-http',
            url: 'https://rea.example.com/mcp',
            headers: { Authorization: 'Bearer super-secret' },
          },
        },
        disabled: false,
        fiber: { state: 2 },
      },
      {
        id: 'include:pencil-mcp',
        options: { id: 'pencil-mcp', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'pencil', transport: 'stdio' } },
        disabled: false,
        fiber: { state: 0 },
      },
      { id: 'other', options: { id: 'other', name: 'something-else' }, disabled: false },
    ],
  }
}

/** 直接调用处理器: 用 EventEmitter 伪造 req, 用最简 res 收集响应。 */
function call(handler, { method = 'GET', url = '/', body, remoteAddress = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter()
    req.method = method
    req.url = url
    req.socket = { remoteAddress }
    req.destroy = () => {}
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(key, value) { this.headers[key] = value },
      end(payload) {
        resolve({ status: this.statusCode, body: payload === undefined ? null : JSON.parse(payload) })
      },
    }
    handler(req, res).catch(reject)
    setImmediate(() => {
      if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
      req.emit('end')
    })
  })
}

// --------------------------------------------------------------- 纯函数

test('normalizeEntry: stdio 只保留 stdio 字段并默认 enabled', () => {
  const result = normalizeEntry({
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'server'],
    env: { TOKEN: '${credential:TOKEN}' },
    enabled: true,
    url: '',
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.entry, {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'server'],
    env: { TOKEN: '${credential:TOKEN}' },
    enabled: true,
  })
})

test('normalizeEntry: 拒绝跨传输字段与缺失必填', () => {
  assert.equal(normalizeEntry({ transport: 'stdio', command: 'x', url: 'https://a' }).ok, false)
  assert.equal(normalizeEntry({ transport: 'stdio' }).ok, false)
  assert.equal(normalizeEntry({ transport: 'streamable-http' }).ok, false)
  assert.equal(normalizeEntry({ transport: 'streamable-http', url: 'ftp://a' }).ok, false)
  assert.equal(normalizeEntry({ transport: 'http' }).ok, false)
})

test('normalizeEntry: streamable-http 保留 headers 且拒绝 stdio 字段', () => {
  const ok = normalizeEntry({
    transport: 'streamable-http',
    url: 'https://mcp.example.com/mcp',
    headers: { Authorization: 'Bearer ${credential:MCP_TOKEN}' },
    command: '',
    args: [],
  })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.entry, {
    transport: 'streamable-http',
    url: 'https://mcp.example.com/mcp',
    headers: { Authorization: 'Bearer ${credential:MCP_TOKEN}' },
    enabled: true,
  })
  assert.equal(normalizeEntry({ transport: 'streamable-http', url: 'https://a', command: 'x' }).ok, false)
})

test('normalizeEntry: 数值与重连字段校验', () => {
  assert.equal(normalizeEntry({ transport: 'stdio', command: 'x', startupTimeoutMs: 0 }).ok, false)
  assert.equal(normalizeEntry({ transport: 'stdio', command: 'x', startupTimeoutMs: 1.5 }).ok, false)
  assert.equal(normalizeEntry({ transport: 'stdio', command: 'x', reconnect: { maxAttempts: -1 } }).ok, false)
  const ok = normalizeEntry({ transport: 'stdio', command: 'x', startupTimeoutMs: 5000, reconnect: { enabled: false } })
  assert.deepEqual(ok.entry.reconnect, { enabled: false })
  assert.equal(ok.entry.startupTimeoutMs, 5000)
})

test('summarizeEntry: 命令行与 URL', () => {
  assert.equal(summarizeEntry({ transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }), 'npx -y pkg')
  assert.equal(summarizeEntry({ transport: 'streamable-http', url: 'https://a/mcp' }), 'https://a/mcp')
  assert.equal(summarizeEntry({}), '')
})

test('secretPathsByServer: 折叠成服务器 -> 字段路径', () => {
  const map = secretPathsByServer([
    { path: ['servers', 'pencil', 'env', 'TOKEN'], set: true },
    { path: ['servers', 'pencil', 'headers', 'Authorization'], set: true },
    { path: ['other'] },
  ])
  assert.deepEqual(map, { pencil: ['env.TOKEN', 'headers.Authorization'] })
})

test('collectServers: 来源判定、运行时合并与排序', () => {
  const rows = collectServers({
    value: {
      servers: {
        pencil: { transport: 'stdio', command: 'pencil' },
        shared: { transport: 'stdio', command: 'shared', enabled: false },
        silent: { transport: 'streamable-http', url: 'https://x' },
      },
    },
    base: { servers: { shared: { transport: 'stdio', command: 'base' } } },
    user: { servers: { pencil: {}, shared: {} } },
    secrets: [{ path: ['servers', 'pencil', 'env', 'TOKEN'], set: true }],
    runtime: [
      { name: 'pencil', configured: true, status: { state: 'connected', toolCount: 2 } },
      { name: 'ghost', configured: false, status: { state: 'closed', result: { closeConfirmed: true } } },
    ],
  })
  const byName = Object.fromEntries(rows.map(row => [row.name, row]))
  assert.equal(byName.pencil.origin, 'user')
  assert.equal(byName.pencil.summary, 'pencil')
  assert.deepEqual(byName.pencil.secrets, ['env.TOKEN'])
  assert.equal(byName.shared.origin, 'override')
  assert.equal(byName.shared.enabled, false)
  assert.equal(byName.silent.origin, 'user')
  assert.equal(byName.silent.status, null)
  assert.equal(byName.ghost.origin, 'stale')
  assert.equal(byName.ghost.configured, false)
  // 配置行在前, 且按名称排序。
  assert.deepEqual(rows.map(row => row.name), ['pencil', 'shared', 'silent', 'ghost'])
})

test('schemaHasServers: 穿透 anyOf 分支', () => {
  assert.equal(schemaHasServers({ properties: { servers: {} } }), true)
  assert.equal(schemaHasServers({ anyOf: [{}, { properties: { servers: {} } }] }), true)
  assert.equal(schemaHasServers({ properties: { other: {} } }), false)
})

test('resolveManagerNamespace: 精确 id 优先, 其次 schema 形状', () => {
  const settings = {
    describe: () => [
      { ns: 'ui-settings', schema: { properties: { enabled: {} } }, value: {} },
      { ns: 'mcp-manager', schema: { properties: { servers: {} } }, value: { servers: {} } },
    ],
  }
  const exact = resolveManagerNamespace({ settings, configEditor: { entries: () => [{ options: { id: 'mcp-manager', name: '@deepseek-ai/dsh-mcp-manager' } }] } })
  assert.equal(exact.ns, 'mcp-manager')
  const byShape = resolveManagerNamespace({ settings, configEditor: undefined })
  assert.equal(byShape.ns, 'mcp-manager')
  const missing = resolveManagerNamespace({ settings: { describe: () => [] }, configEditor: undefined })
  assert.equal(missing.ns, null)
  assert.equal(missing.reason, 'mcp-manager-namespace-missing')
})

// --------------------------------------------------------------- HTTP

test('GET /state: 配置真相 + 运行时真相', async () => {
  const settings = createSettings({ servers: { pencil: { transport: 'stdio', command: 'pencil' } } })
  const handler = createApiHandler(createDeps({ settings, manager: createManager() }))
  const response = await call(handler, { url: '/api/mcp-manager/state' })
  assert.equal(response.status, 200)
  assert.equal(response.body.namespace.id, 'mcp-manager')
  assert.equal(response.body.services.manager, true)
  const pencil = response.body.servers.find(server => server.name === 'pencil')
  assert.equal(pencil.origin, 'user')
  assert.deepEqual(pencil.status, { state: 'connected', toolCount: 3, connectedAt: 1 })
  const ghost = response.body.servers.find(server => server.name === 'plugin-owned')
  assert.equal(ghost.origin, 'registered')
})

test('GET /state: 缺少服务时给出标志而不是抛错', async () => {
  const handler = createApiHandler(createDeps({}))
  const response = await call(handler, { url: '/api/mcp-manager/state' })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body.services, { settings: false, manager: false, configEditor: false })
  assert.deepEqual(response.body.servers, [])
  assert.equal(response.body.namespace.id, null)
  assert.equal(response.body.namespace.reason, 'settings-service-missing')
})

test('GET /state: 静态挂载的 mcp-client 只读列出且不泄露请求头', async () => {
  const handler = createApiHandler(createDeps({ settings: createSettings({ servers: {} }), loader: createLoader() }))
  const response = await call(handler, { url: '/api/mcp-manager/state' })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body.unmanaged, [
    { id: 'pencil-mcp', serverName: 'pencil', transport: 'stdio', enabled: true, phase: 'pending' },
    { id: 'rea-mcp', serverName: 'rea', transport: 'streamable-http', enabled: true, phase: 'active' },
  ])
  assert.equal(JSON.stringify(response.body).includes('super-secret'), false)
})

test('非回环请求被拒绝', async () => {
  const handler = createApiHandler(createDeps({ isLocal: () => false }))
  const response = await call(handler, { url: '/api/mcp-manager/state', remoteAddress: '10.0.0.9' })
  assert.equal(response.status, 403)
})

test('未知路由与非 POST 动作', async () => {
  const handler = createApiHandler(createDeps({}))
  assert.equal((await call(handler, { url: '/api/mcp-manager/nope' })).status, 404)
  const response = await call(handler, { method: 'GET', url: '/api/mcp-manager/action' })
  assert.equal(response.status, 404)
})

test('add: 走 settings.mutate 并带 revision', async () => {
  const settings = createSettings({ servers: {} })
  const handler = createApiHandler(createDeps({ settings, manager: createManager() }))
  const response = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: {
      action: 'add',
      name: 'demo',
      entry: { transport: 'streamable-http', url: 'https://mcp.example.com/mcp', enabled: true },
    },
  })
  assert.equal(response.status, 200)
  assert.equal(settings.state.calls.length, 1)
  assert.equal(settings.state.calls[0].expectedRevision, 1)
  assert.deepEqual(settings.state.calls[0].ops, [
    { op: 'set', path: ['servers', 'demo'], value: { transport: 'streamable-http', url: 'https://mcp.example.com/mcp', enabled: true } },
  ])
  assert.equal(settings.state.value.servers.demo.url, 'https://mcp.example.com/mcp')
})

test('add: 同名与非法名称被拒绝', async () => {
  const settings = createSettings({ servers: { demo: { transport: 'stdio', command: 'x' } } })
  const handler = createApiHandler(createDeps({ settings }))
  const duplicate = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'add', name: 'demo', entry: { transport: 'stdio', command: 'x' } },
  })
  assert.equal(duplicate.status, 409)
  assert.equal(duplicate.body.code, 'name-exists')
  const badName = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'add', name: 'bad name!', entry: { transport: 'stdio', command: 'x' } },
  })
  assert.equal(badName.status, 400)
  assert.equal(badName.body.code, 'name-invalid')
})

test('save / disable / delete: 写入路径正确', async () => {
  const settings = createSettings({ servers: { demo: { transport: 'stdio', command: 'old', enabled: true } } })
  const handler = createApiHandler(createDeps({ settings }))

  const saved = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'save', name: 'demo', entry: { transport: 'stdio', command: 'new' } },
  })
  assert.equal(saved.status, 200)
  assert.equal(settings.state.value.servers.demo.command, 'new')

  const disabled = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'disable', name: 'demo' },
  })
  assert.equal(disabled.status, 200)
  assert.equal(settings.state.value.servers.demo.enabled, false)
  assert.deepEqual(settings.state.calls.at(-1).ops, [{ op: 'set', path: ['servers', 'demo', 'enabled'], value: false }])

  const deleted = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'delete', name: 'demo' },
  })
  assert.equal(deleted.status, 200)
  assert.equal('demo' in settings.state.value.servers, false)
})

test('save: revision 变化时把冲突暴露成 409', async () => {
  const settings = createSettings({ servers: { demo: { transport: 'stdio', command: 'x' } } })
  const original = settings.describe
  let bumped = false
  settings.describe = () => {
    const descriptors = original()
    // 第一次写入前的读取拿到的是过期 revision。
    if (!bumped) {
      bumped = true
      return [{ ...descriptors[0], revision: 99 }]
    }
    return descriptors
  }
  const handler = createApiHandler(createDeps({ settings }))
  const response = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'disable', name: 'demo' },
  })
  assert.equal(response.status, 409)
  assert.equal(response.body.code, 'write-failed')
  assert.match(response.body.error, /写入配置失败/)
})

test('import: 多条一次写入, 返回名称, 空 env 被省略', async () => {
  const settings = createSettings({ servers: {} })
  const handler = createApiHandler(createDeps({ settings }))
  const response = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: {
      action: 'import',
      entries: [
        { name: 'pencil', entry: { transport: 'stdio', command: 'pencil.exe', args: ['--app', 'desktop'], env: {} } },
        { name: 'remote', entry: { transport: 'streamable-http', url: 'https://x/mcp' } },
      ],
    },
  })
  assert.equal(response.status, 200)
  assert.equal(response.body.imported, 2)
  assert.deepEqual(response.body.names, ['pencil', 'remote'])
  // 原子: 只调用一次 mutate, 两个 set 操作。
  assert.equal(settings.state.calls.length, 1)
  assert.equal(settings.state.calls[0].ops.length, 2)
  assert.deepEqual(settings.state.value.servers.pencil, {
    transport: 'stdio', command: 'pencil.exe', args: ['--app', 'desktop'], enabled: true,
  })
  assert.equal(settings.state.value.servers.remote.url, 'https://x/mcp')
})

test('import: 同名冲突默认拒绝, 勾选覆盖后写入', async () => {
  const settings = createSettings({ servers: { demo: { transport: 'stdio', command: 'old' } } })
  const handler = createApiHandler(createDeps({ settings }))
  const entries = [{ name: 'demo', entry: { transport: 'stdio', command: 'new' } }]

  const conflict = await call(handler, {
    method: 'POST', url: '/api/mcp-manager/action', body: { action: 'import', entries },
  })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.code, 'name-conflicts')
  assert.deepEqual(conflict.body.params, { names: 'demo' })
  assert.equal(settings.state.value.servers.demo.command, 'old')

  const overwritten = await call(handler, {
    method: 'POST', url: '/api/mcp-manager/action', body: { action: 'import', entries, overwrite: true },
  })
  assert.equal(overwritten.status, 200)
  assert.deepEqual(overwritten.body.overwritten, ['demo'])
  assert.equal(settings.state.value.servers.demo.command, 'new')
})

test('import: 重复名、空列表、超限与非法条目都被拒绝', async () => {
  const settings = createSettings({ servers: {} })
  const handler = createApiHandler(createDeps({ settings }))
  const post = body => call(handler, { method: 'POST', url: '/api/mcp-manager/action', body: { action: 'import', ...body } })

  const duplicate = await post({
    entries: [
      { name: 'a', entry: { transport: 'stdio', command: 'x' } },
      { name: 'a', entry: { transport: 'stdio', command: 'y' } },
    ],
  })
  assert.equal(duplicate.status, 400)
  assert.equal(duplicate.body.code, 'import-duplicate')

  const empty = await post({ entries: [] })
  assert.equal(empty.status, 400)
  assert.equal(empty.body.code, 'import-empty')

  const tooMany = await post({
    entries: Array.from({ length: 51 }, (_, index) => ({ name: `s${index}`, entry: { transport: 'stdio', command: 'x' } })),
  })
  assert.equal(tooMany.status, 400)
  assert.equal(tooMany.body.code, 'import-too-many')

  const invalid = await post({ entries: [{ name: 'bad', entry: { transport: 'stdio' } }] })
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.code, 'entry-invalid')
  assert.match(invalid.body.params.message, /command/)
  // 全部失败路径都没有写盘。
  assert.equal(settings.state.calls.length, 0)
})

test('probe / restart: 转发给管理器并归一化异常', async () => {
  const settings = createSettings({ servers: { demo: { transport: 'stdio', command: 'x' } } })
  const manager = createManager()
  const handler = createApiHandler(createDeps({ settings, manager }))

  const probed = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'probe', name: 'demo' },
  })
  assert.equal(probed.status, 200)
  assert.equal(probed.body.result.ok, true)
  assert.deepEqual(probed.body.result.toolNames, ['ping'])

  manager.probe = async () => { throw new Error('cleanup incomplete') }
  const failedProbe = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'probe', name: 'demo' },
  })
  assert.equal(failedProbe.status, 200)
  assert.equal(failedProbe.body.result.ok, false)
  assert.match(failedProbe.body.result.message, /cleanup incomplete/)

  manager.restart = async () => { throw new Error('no such entry') }
  const failedRestart = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'restart', name: 'demo' },
  })
  assert.equal(failedRestart.status, 400)
  assert.match(failedRestart.body.error, /重启失败/)
})

test('action: 管理器缺失时 probe 报 503, 未知动作报 400', async () => {
  const settings = createSettings({ servers: { demo: { transport: 'stdio', command: 'x' } } })
  const handler = createApiHandler(createDeps({ settings }))
  const probe = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'probe', name: 'demo' },
  })
  assert.equal(probe.status, 503)
  const unknown = await call(handler, {
    method: 'POST',
    url: '/api/mcp-manager/action',
    body: { action: 'explode' },
  })
  assert.equal(unknown.status, 400)
})
