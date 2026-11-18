/**
 * MCP 服务器条目的纯函数层: 校验与归一化写入值, 并把
 * settings.describe() 的配置真相与 mcpManager.list() 的运行时真相合并成
 * 页面行。这里不做 I/O, 便于用 node --test 直接覆盖。
 */

/** 服务器名同时是工具命名空间与实例 serverName。 */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export const TRANSPORTS = ['stdio', 'streamable-http']

const STDIO_FIELDS = ['command', 'args', 'env', 'cwd']
const HTTP_FIELDS = ['url', 'headers']
const NUMERIC_FIELDS = ['startupTimeoutMs', 'toolCallTimeoutMs', 'closeTimeoutMs']

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 字符串映射 (env / headers): 键值都必须是字符串, 空对象省略。 */
function stringRecord(value, label) {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (!isPlainObject(value)) return { ok: false, error: `${label} must be an object` }
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof key !== 'string' || key.length === 0) return { ok: false, error: `${label} has an empty key` }
    if (typeof item !== 'string') return { ok: false, error: `${label}.${key} must be a string` }
    out[key] = item
  }
  return { ok: true, value: Object.keys(out).length === 0 ? undefined : out }
}

function stringList(value, label) {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    return { ok: false, error: `${label} must be an array of strings` }
  }
  return { ok: true, value: value.length === 0 ? undefined : [...value] }
}

function positiveInteger(value, label) {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || Math.floor(value) !== value) {
    return { ok: false, error: `${label} must be a positive integer` }
  }
  return { ok: true, value }
}

function optionalText(value, label) {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (typeof value !== 'string') return { ok: false, error: `${label} must be a string` }
  return { ok: true, value: value.length === 0 ? undefined : value }
}

/**
 * 把页面提交的条目归一化成 mcp-manager 接受的形态。
 * 只保留所选 transport 的字段, 因此切换 transport 时不会残留跨传输字段
 * (跨传输字段会被管理器在写入时拒绝)。
 * @returns {{ok: true, entry: object} | {ok: false, error: string}}
 */
export function normalizeEntry(input) {
  if (!isPlainObject(input)) return { ok: false, error: 'entry must be an object' }
  const transport = input.transport
  if (!TRANSPORTS.includes(transport)) {
    return { ok: false, error: `transport must be one of ${TRANSPORTS.join(', ')}` }
  }
  const entry = { transport }

  if (transport === 'stdio') {
    const command = optionalText(input.command, 'command')
    if (!command.ok) return command
    if (command.value === undefined) return { ok: false, error: 'command is required for stdio transport' }
    entry.command = command.value

    const args = stringList(input.args, 'args')
    if (!args.ok) return args
    if (args.value !== undefined) entry.args = args.value

    const env = stringRecord(input.env, 'env')
    if (!env.ok) return env
    if (env.value !== undefined) entry.env = env.value

    const cwd = optionalText(input.cwd, 'cwd')
    if (!cwd.ok) return cwd
    if (cwd.value !== undefined) entry.cwd = cwd.value

    for (const field of HTTP_FIELDS) {
      if (input[field] !== undefined && input[field] !== null && input[field] !== '') {
        return { ok: false, error: `${field} is not accepted for stdio transport` }
      }
    }
  } else {
    const url = optionalText(input.url, 'url')
    if (!url.ok) return url
    if (url.value === undefined) return { ok: false, error: 'url is required for streamable-http transport' }
    if (!/^https?:\/\//i.test(url.value)) return { ok: false, error: 'url must start with http:// or https://' }
    entry.url = url.value

    const headers = stringRecord(input.headers, 'headers')
    if (!headers.ok) return headers
    if (headers.value !== undefined) entry.headers = headers.value

    for (const field of STDIO_FIELDS) {
      const value = input[field]
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
      if (!empty && !isPlainObject(value)) return { ok: false, error: `${field} is not accepted for streamable-http transport` }
      if (!empty) return { ok: false, error: `${field} is not accepted for streamable-http transport` }
    }
  }

  if (input.enabled !== undefined && input.enabled !== null && typeof input.enabled !== 'boolean') {
    return { ok: false, error: 'enabled must be a boolean' }
  }
  entry.enabled = input.enabled !== false

  for (const field of NUMERIC_FIELDS) {
    const parsed = positiveInteger(input[field], field)
    if (!parsed.ok) return parsed
    if (parsed.value !== undefined) entry[field] = parsed.value
  }

  if (input.reconnect !== undefined && input.reconnect !== null) {
    if (!isPlainObject(input.reconnect)) return { ok: false, error: 'reconnect must be an object' }
    const reconnect = {}
    if (input.reconnect.enabled !== undefined && input.reconnect.enabled !== null) {
      if (typeof input.reconnect.enabled !== 'boolean') return { ok: false, error: 'reconnect.enabled must be a boolean' }
      reconnect.enabled = input.reconnect.enabled
    }
    for (const field of ['initialDelayMs', 'maxDelayMs', 'maxAttempts']) {
      const parsed = positiveInteger(input.reconnect[field], `reconnect.${field}`)
      if (!parsed.ok) return parsed
      if (parsed.value !== undefined) reconnect[field] = parsed.value
    }
    if (Object.keys(reconnect).length > 0) entry.reconnect = reconnect
  }

  return { ok: true, entry }
}

/** 一行摘要: stdio 展示命令行, streamable-http 展示 URL。 */
export function summarizeEntry(entry) {
  if (entry === null || typeof entry !== 'object') return ''
  if (entry.transport === 'streamable-http') return typeof entry.url === 'string' ? entry.url : ''
  const command = typeof entry.command === 'string' ? entry.command : ''
  const args = Array.isArray(entry.args) ? entry.args.filter(item => typeof item === 'string') : []
  return [command, ...args].filter(part => part.length > 0).join(' ')
}

/** 把 secrets 描述折叠成 服务器名 -> 被隐藏的字段路径。 */
export function secretPathsByServer(secrets) {
  const out = {}
  if (!Array.isArray(secrets)) return out
  for (const secret of secrets) {
    if (!isPlainObject(secret) || !Array.isArray(secret.path)) continue
    const [head, name, ...rest] = secret.path
    if (head !== 'servers' || typeof name !== 'string' || rest.length === 0) continue
    if (!out[name]) out[name] = []
    out[name].push(rest.join('.'))
  }
  return out
}

function serversOf(layer) {
  if (!isPlainObject(layer) || !isPlainObject(layer.servers)) return {}
  return layer.servers
}

/**
 * 合并配置真相与运行时真相。
 * 行的来源: 用户层新增 / 用户层覆盖继承 / 继承自基础层 / 插件注册 / 待清理残留。
 * @returns {Array<object>} 按名称排序的服务器行
 */
export function collectServers({ value, base, user, secrets, runtime } = {}) {
  const configured = serversOf(value)
  const inherited = serversOf(base)
  const overrides = serversOf(user)
  const secretPaths = secretPathsByServer(secrets)
  const runtimeByName = new Map()
  for (const item of Array.isArray(runtime) ? runtime : []) {
    if (item && typeof item.name === 'string') runtimeByName.set(item.name, item)
  }

  const rows = []
  for (const [name, config] of Object.entries(configured)) {
    const live = runtimeByName.get(name)
    let origin = 'user'
    if (name in overrides) origin = name in inherited ? 'override' : 'user'
    else if (name in inherited) origin = 'inherited'
    else if (live !== undefined && live.configured === false) origin = 'registered'
    rows.push({
      name,
      origin,
      configured: true,
      enabled: config?.enabled !== false,
      transport: typeof config?.transport === 'string' ? config.transport : '',
      summary: summarizeEntry(config),
      config: config ?? {},
      secrets: secretPaths[name] ?? [],
      status: live?.status ?? null,
    })
  }

  for (const [name, live] of runtimeByName) {
    if (name in configured) continue
    // 已移除但仍保留的运行时记录 (清理未完成 / 失败)。
    rows.push({
      name,
      origin: live.configured === false ? 'stale' : 'registered',
      configured: false,
      enabled: false,
      transport: '',
      summary: '',
      config: null,
      secrets: [],
      status: live.status ?? null,
    })
  }

  rows.sort((left, right) => {
    if (left.configured !== right.configured) return left.configured ? -1 : 1
    return left.name.localeCompare(right.name)
  })
  return rows
}
