/**
 * 宿主侧 HTTP API: 页面只通过这里读写 MCP 配置与驱动运行时操作。
 *
 * 路由 (仅本机回环):
 *   GET  /api/mcp-manager/state   -> 配置真相 + 运行时真相
 *   POST /api/mcp-manager/action  -> probe / restart / enable / disable / add / save / delete
 *
 * 写入一律走 Settings 表单服务 (settings.mutate + revision), 因此与设置界面
 * 走同一条持久化路径, 由 config-editor 落盘并热更新 volatile 配置。
 */
import { collectServers, normalizeEntry, SERVER_NAME_PATTERN } from './servers.js'
import { resolveManagerNamespace, MCP_MANAGER_PACKAGE } from './namespace.js'

export const ENDPOINT = '/api/mcp-manager'
const MAX_BODY_BYTES = 256 * 1024
const PROBE_TIMEOUT_MS = 20_000
/** 一次导入的条目上限: 防止误贴整份文档且写入体过大。 */
const MAX_IMPORT_ENTRIES = 50

class HttpError extends Error {
  constructor(status, message, code, params) {
    super(message)
    this.status = status
    this.code = code
    this.params = params
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 单行化: 管理器异常信息可能带换行, 页面按一行展示。 */
function messageOf(error) {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/\s+/g, ' ').trim().slice(0, 2000)
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, '请求体过大', 'body-too-large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.trim().length === 0) return resolve({})
      try {
        const parsed = JSON.parse(raw)
        if (!isPlainObject(parsed)) return reject(new HttpError(400, '请求体必须是 JSON 对象', 'bad-request'))
        resolve(parsed)
      } catch {
        reject(new HttpError(400, '请求体不是合法 JSON', 'bad-json'))
      }
    })
    req.on('error', error => { reject(error) })
  })
}

function runtimeList(manager) {
  if (manager === undefined || manager === null || typeof manager.list !== 'function') return []
  try {
    const list = manager.list()
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const FIBER_PHASE = { 0: 'pending', 1: 'loading', 2: 'active', 3: 'failed', 4: null, 5: 'unloading' }

/**
 * 静态挂载的 mcp-client 行 (@deepseek-ai/dsh-mcp-client) 不在管理器编队里
 * (管理器只管自己的 config.servers 与插件注册)。它们仍然向模型提供工具,
 * 所以页面单独只读列出, 避免"页面空白但工具存在"的误导。
 * 只暴露 serverName/transport/阶段, 不暴露 env/headers 值。
 */
function unmanagedClients(deps) {
  const loader = deps.get('loader')
  if (loader === undefined || loader === null || typeof loader.entries !== 'function') return []
  const rows = []
  try {
    for (const entry of loader.entries()) {
      const options = isPlainObject(entry?.options) ? entry.options : {}
      if (options.name !== '@deepseek-ai/dsh-mcp-client') continue
      if (options.group === true) continue
      const config = isPlainObject(options.config) ? options.config : {}
      rows.push({
        id: typeof options.id === 'string' ? options.id : String(entry.id ?? ''),
        serverName: typeof config.serverName === 'string' ? config.serverName : '',
        transport: typeof config.transport === 'string' ? config.transport : '',
        enabled: entry.disabled !== true,
        phase: entry.fiber === undefined || entry.fiber === null ? null : (FIBER_PHASE[entry.fiber.state] ?? null),
      })
    }
  } catch {
    return []
  }
  rows.sort((left, right) => left.serverName.localeCompare(right.serverName))
  return rows
}

function readState(deps) {
  const settings = deps.get('settings')
  const configEditor = deps.get('configEditor')
  const manager = deps.get('mcpManager')
  const resolved = resolveManagerNamespace({ settings, configEditor })
  const descriptor = resolved.descriptor
  const runtime = runtimeList(manager)

  const servers = descriptor === null
    ? []
    : collectServers({
      value: descriptor.value,
      base: descriptor.base,
      user: descriptor.user,
      secrets: descriptor.secrets,
      runtime,
    })

  return {
    ok: true,
    managerPackage: MCP_MANAGER_PACKAGE,
    services: {
      settings: settings !== undefined && settings !== null,
      manager: manager !== undefined && manager !== null,
      configEditor: configEditor !== undefined && configEditor !== null,
    },
    namespace: {
      id: resolved.ns,
      revision: descriptor?.revision ?? null,
      reason: resolved.reason ?? null,
    },
    servers,
    unmanaged: unmanagedClients(deps),
    generatedAt: Date.now(),
  }
}

/** 读取当前命名空间与版本; 写入前调用, 拿到的 revision 即本次写入的期望值。 */
function requireNamespace(deps) {
  const resolved = resolveManagerNamespace({ settings: deps.get('settings'), configEditor: deps.get('configEditor') })
  if (resolved.descriptor === null) {
    throw new HttpError(
      503,
      `未找到内置 MCP 管理器的配置命名空间 (${resolved.reason ?? 'unknown'})，请确认已加载 ${MCP_MANAGER_PACKAGE}`,
      'manager-namespace-missing',
      { reason: resolved.reason ?? 'unknown' },
    )
  }
  return resolved
}

async function writeServers(deps, ops) {
  const { ns, descriptor } = requireNamespace(deps)
  const settings = deps.get('settings')
  try {
    await settings.mutate(ns, ops, descriptor.revision)
  } catch (error) {
    throw new HttpError(409, `写入配置失败: ${messageOf(error)}`, 'write-failed', { message: messageOf(error) })
  }
  return { ns, revision: descriptor.revision }
}

function requireName(body) {
  const name = body.name
  if (typeof name !== 'string' || !SERVER_NAME_PATTERN.test(name)) {
    throw new HttpError(400, '服务器名只能包含字母、数字、下划线和短横线，长度 1-32', 'name-invalid')
  }
  return name
}

function configuredServers(deps) {
  const resolved = requireNamespace(deps)
  const servers = resolved.descriptor.value
  return {
    resolved,
    servers: isPlainObject(servers) && isPlainObject(servers.servers) ? servers.servers : {},
  }
}

async function runAction(deps, body) {
  const action = body.action
  const manager = deps.get('mcpManager')

  if (action === 'probe') {
    const name = requireName(body)
    if (manager === undefined || manager === null) {
      throw new HttpError(503, '内置 MCP 管理器未加载，无法测试连接', 'manager-missing')
    }
    try {
      const result = await manager.probe(name, { timeoutMs: PROBE_TIMEOUT_MS })
      return { ok: true, action, name, result }
    } catch (error) {
      return { ok: true, action, name, result: { ok: false, stage: 'connect', message: messageOf(error), durationMs: 0, closeConfirmed: false } }
    }
  }

  if (action === 'restart') {
    const name = requireName(body)
    if (manager === undefined || manager === null) {
      throw new HttpError(503, '内置 MCP 管理器未加载，无法重启', 'manager-missing')
    }
    try {
      await manager.restart(name)
      return { ok: true, action, name }
    } catch (error) {
      throw new HttpError(400, `重启失败: ${messageOf(error)}`, 'restart-failed', { message: messageOf(error) })
    }
  }

  if (action === 'enable' || action === 'disable') {
    const name = requireName(body)
    const { ns } = await writeServers(deps, [{ op: 'set', path: ['servers', name, 'enabled'], value: action === 'enable' }])
    return { ok: true, action, name, ns }
  }

  if (action === 'add' || action === 'save') {
    const name = requireName(body)
    const normalized = normalizeEntry(body.entry)
    if (!normalized.ok) throw new HttpError(400, normalized.error, 'entry-invalid', { message: normalized.error })
    const { servers } = configuredServers(deps)
    const exists = Object.prototype.hasOwnProperty.call(servers, name)
    if (action === 'add' && exists) {
      throw new HttpError(409, `已存在同名服务器 ${name}，请使用编辑`, 'name-exists', { name })
    }
    if (action === 'save' && !exists) {
      throw new HttpError(404, `服务器 ${name} 不存在，可能已被其他窗口删除`, 'server-missing', { name })
    }
    const { ns } = await writeServers(deps, [{ op: 'set', path: ['servers', name], value: normalized.entry }])
    return { ok: true, action, name, ns }
  }

  if (action === 'delete') {
    const name = requireName(body)
    const { servers } = configuredServers(deps)
    if (!Object.prototype.hasOwnProperty.call(servers, name)) {
      throw new HttpError(404, `服务器 ${name} 不存在`, 'server-missing', { name })
    }
    const { ns } = await writeServers(deps, [{ op: 'unset', path: ['servers', name] }])
    return { ok: true, action, name, ns }
  }

  if (action === 'import') {
    const items = body.entries
    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpError(400, '导入内容里没有服务器条目', 'import-empty')
    }
    if (items.length > MAX_IMPORT_ENTRIES) {
      throw new HttpError(400, `一次最多导入 ${MAX_IMPORT_ENTRIES} 个服务器`, 'import-too-many', { max: MAX_IMPORT_ENTRIES })
    }
    const overwrite = body.overwrite === true
    const { servers } = configuredServers(deps)
    const seen = new Set()
    const entries = []
    for (const item of items) {
      if (!isPlainObject(item)) {
        throw new HttpError(400, '每个条目必须是 JSON 对象', 'entry-invalid', { message: 'item must be an object' })
      }
      const name = item.name
      if (typeof name !== 'string' || !SERVER_NAME_PATTERN.test(name)) {
        throw new HttpError(400, '服务器名只能包含字母、数字、下划线和短横线，长度 1-32', 'name-invalid', { name: String(name) })
      }
      if (seen.has(name)) {
        throw new HttpError(400, `导入内容里重复出现服务器名 ${name}`, 'import-duplicate', { name })
      }
      seen.add(name)
      const normalized = normalizeEntry(item.entry)
      if (!normalized.ok) {
        throw new HttpError(400, `${name}: ${normalized.error}`, 'entry-invalid', { message: normalized.error, name })
      }
      entries.push({ name, entry: normalized.entry })
    }

    const conflicts = entries
      .map(item => item.name)
      .filter(name => Object.prototype.hasOwnProperty.call(servers, name))
    if (!overwrite && conflicts.length > 0) {
      throw new HttpError(
        409,
        `已存在同名服务器: ${conflicts.join(', ')}（可勾选覆盖后重试）`,
        'name-conflicts',
        { names: conflicts.join(', ') },
      )
    }

    // 单个 mutate: 全部条目一次写入, 要么全成功要么全不写。
    const { ns } = await writeServers(
      deps,
      entries.map(item => ({ op: 'set', path: ['servers', item.name], value: item.entry })),
    )
    return {
      ok: true,
      action,
      ns,
      imported: entries.length,
      names: entries.map(item => item.name),
      overwritten: overwrite ? conflicts : [],
    }
  }

  throw new HttpError(400, `未知操作: ${String(action)}`, 'unknown-action', { action: String(action) })
}

/**
 * @param {{
 *   get: (name: string) => unknown,
 *   isLocal: (req: import('node:http').IncomingMessage) => boolean,
 *   logger?: { warn?: (...args: unknown[]) => void },
 * }} deps
 */
export function createApiHandler(deps) {
  return async function handler(req, res) {
    try {
      if (!deps.isLocal(req)) {
        send(res, 403, { error: '仅接受本机回环请求', code: 'loopback-only' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const path = url.pathname.startsWith(ENDPOINT)
        ? url.pathname.slice(ENDPOINT.length) || '/'
        : url.pathname

      if (req.method === 'GET' && path === '/state') {
        send(res, 200, readState(deps))
        return
      }
      if (req.method === 'POST' && path === '/action') {
        const body = await readJsonBody(req)
        send(res, 200, await runAction(deps, body))
        return
      }
      send(res, 404, { error: '未找到该路由', code: 'not-found' })
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      if (status >= 500) deps.logger?.warn?.('mcp-ui: request failed: %s', messageOf(error))
      send(res, status, {
        error: messageOf(error),
        code: error instanceof HttpError ? error.code : 'internal-error',
        params: error instanceof HttpError ? error.params : undefined,
      })
    }
  }
}
