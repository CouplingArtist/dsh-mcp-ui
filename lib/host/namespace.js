/**
 * 定位内置 MCP 管理器在 Settings 里的命名空间。
 *
 * 管理器的 volatile `config.servers` 由 Settings 表单服务按 profile 条目 id
 * 暴露为 Settings 命名空间, 所以写入必须落在那个 id 上。优先用
 * configEditor 的活跃条目表读出精确 id; 读不到时退回按名称后缀与 schema
 * 形状识别 describe() 的命名空间。
 */

export const MCP_MANAGER_PACKAGE = '@deepseek-ai/dsh-mcp-manager'

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 条目的 id/name 在 Loader 投影里可能位于 options 下, 两种形态都接受。 */
function entryIdOf(entry) {
  if (!isPlainObject(entry)) return undefined
  const nested = isPlainObject(entry.options) ? entry.options : undefined
  const id = nested?.id ?? entry.id
  return typeof id === 'string' ? id : undefined
}

function entryNameOf(entry) {
  if (!isPlainObject(entry)) return undefined
  const nested = isPlainObject(entry.options) ? entry.options : undefined
  const name = nested?.name ?? entry.name
  return typeof name === 'string' ? name : undefined
}

/** schema 顶层 (含 anyOf/oneOf/allOf 分支) 是否声明 servers 字段。 */
export function schemaHasServers(schema, depth = 0) {
  if (!isPlainObject(schema) || depth > 6) return false
  if (isPlainObject(schema.properties) && 'servers' in schema.properties) return true
  for (const branch of ['anyOf', 'oneOf', 'allOf']) {
    const list = schema[branch]
    if (!Array.isArray(list)) continue
    for (const item of list) if (schemaHasServers(item, depth + 1)) return true
  }
  return false
}

function pickDescriptor(descriptors, expectedId) {
  const list = descriptors.filter(item => isPlainObject(item) && typeof item.ns === 'string')
  if (expectedId !== undefined) {
    const exact = list.find(item => item.ns === expectedId)
    if (exact !== undefined) return exact
  }
  const suffix = list.find(item => item.ns === 'mcp-manager' || item.ns.endsWith(':mcp-manager') || item.ns.endsWith('/mcp-manager'))
  if (suffix !== undefined) return suffix
  const bySchema = list.find(item => schemaHasServers(item.schema))
  if (bySchema !== undefined) return bySchema
  return list.find(item => isPlainObject(item.value) && isPlainObject(item.value.servers)) ?? null
}

/**
 * @returns {{ns: string, descriptor: object} | {ns: null, descriptor: null, reason: string}}
 */
export function resolveManagerNamespace(services) {
  const { settings, configEditor } = services
  if (settings === undefined || settings === null) {
    return { ns: null, descriptor: null, reason: 'settings-service-missing' }
  }
  let expectedId
  try {
    const entries = typeof configEditor?.entries === 'function' ? configEditor.entries() : []
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entryNameOf(entry) === MCP_MANAGER_PACKAGE) {
        expectedId = entryIdOf(entry)
        if (expectedId !== undefined) break
      }
    }
  } catch {
    // configEditor 不可用时只靠 describe 的命名空间识别。
  }

  let descriptors
  try {
    descriptors = settings.describe({ redactSecrets: true })
  } catch {
    return { ns: null, descriptor: null, reason: 'settings-describe-failed' }
  }
  const descriptor = pickDescriptor(Array.isArray(descriptors) ? descriptors : [], expectedId)
  if (descriptor === null) {
    return { ns: null, descriptor: null, reason: 'mcp-manager-namespace-missing' }
  }
  return { ns: descriptor.ns, descriptor }
}
