/**
 * 客户端模块冒烟测试: 在 node 里加载真实的 client.js, 用假的 React 钩子
 * 执行 apply 与首屏渲染, 验证槽位注册与页面不再抛错。
 * 这不是视觉验证 —— 渲染结果只是元素树。
 * 运行: node tests/client-module.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** 执行模块外壳, 取回 __ModuleLoader__.load 收到的定义。 */
function loadDefinition() {
  let definition
  const window = { __ModuleLoader__: { load(value) { definition = value } } }
  runInNewContext(SOURCE, { window, console })
  assert.ok(definition !== undefined, 'client.js 未调用 window.__ModuleLoader__.load')
  return definition
}

/** 只够跑通函数组件的假 React。 */
function createFakeReact() {
  return {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) { return { type, props: props ?? {}, children } },
    useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] },
    useEffect() {},
    useRef(value) { return { current: value ?? null } },
    useCallback(fn) { return fn },
  }
}

function createClientContext(react) {
  const registrations = []
  const dictionaries = []
  const effects = []
  const context = {
    react,
    registrations,
    dictionaries,
    effect(callback, label) {
      effects.push(label)
      const cleanup = callback()
      assert.equal(typeof cleanup, 'function')
    },
    locale: {
      register(ns, dicts) {
        dictionaries.push({ ns, dicts })
        return () => {}
      },
      bind(ns) {
        return (key) => {
          const entry = dictionaries.find(item => item.ns === ns)
          return entry?.dicts.zh?.[key] ?? key
        }
      },
      subscribe() { return () => {} },
    },
    slots: {
      inject(slot, callback) {
        callback()
        return () => {}
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  return context
}

/** 递归渲染函数组件 (钩子为假, 不执行副作用)。 */
function render(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(render)
  if (typeof node.type === 'function') {
    // 函数组件按 props 调用; 组件内部通过 h(...) 继续构造元素。
    return render(node.type({ ...node.props, children: node.children }))
  }
  return { type: node.type, props: node.props, children: node.children.map(render) }
}

function collectText(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string') { out.push(node); return out }
  if (Array.isArray(node)) { for (const item of node) collectText(item, out); return out }
  if (node.children !== undefined) for (const child of node.children) collectText(child, out)
  return out
}

test('client.js 外层结构: id 与工厂', () => {
  const definition = loadDefinition()
  assert.equal(definition.id, 'dsh-mcp-ui')
  assert.equal(typeof definition.factory, 'function')
})

test('apply: 注册 settings.section 与导航图标, 并加载双语文案', () => {
  const definition = loadDefinition()
  const react = createFakeReact()
  const clientModule = definition.factory(name => {
    assert.equal(name, 'react')
    return react
  })
  assert.equal(clientModule.name, 'mcp-ui')
  // vm 里创建的数组与本 realm 原型不同, 用字符串比较。
  assert.equal([...clientModule.inject].join(','), 'slots,locale')

  const client = createClientContext(react)
  clientModule.apply(client)

  assert.equal(client.dictionaries.length, 1)
  assert.equal(client.dictionaries[0].ns, 'settings.mcpManager')
  assert.ok(client.dictionaries[0].dicts.zh.title.length > 0)
  assert.ok(client.dictionaries[0].dicts.en.title.length > 0)

  assert.equal(client.registrations.length, 2)
  const [section, icon] = client.registrations
  assert.equal(section.options.name, 'settings.section')
  assert.equal(section.options.id, 'mcp')
  assert.equal(section.options.order, 12)
  assert.equal(section.options.label(), 'MCP')
  assert.equal(icon.options.name, 'settings.section.icon')
  assert.equal(icon.options.id, 'mcp')
})

test('首屏渲染: 没有数据时显示标题与加载态, 不抛错', () => {
  const definition = loadDefinition()
  const react = createFakeReact()
  const clientModule = definition.factory(() => react)
  const client = createClientContext(react)
  clientModule.apply(client)

  const section = client.registrations[0].component
  const tree = render(section({ close() {} }))
  const text = collectText(tree).join(' | ')

  assert.match(text, /MCP 服务器/)
  assert.match(text, /加载中/)
  assert.match(text, /添加服务器/)
  assert.match(text, /刷新/)
  // 首屏是加载态: 不应出现空列表提示或服务缺失横幅。
  assert.doesNotMatch(text, /还没有配置任何/)
  assert.doesNotMatch(text, /没有加载内置 MCP 管理器/)
})

test('导航图标渲染: 接受 size 与 active', () => {
  const definition = loadDefinition()
  const react = createFakeReact()
  const clientModule = definition.factory(() => react)
  const client = createClientContext(react)
  clientModule.apply(client)
  const icon = client.registrations[1].component
  const tree = render(icon({ size: 18, active: true }))
  assert.equal(tree.type, 'svg')
  assert.equal(tree.props.width, 18)
  assert.equal(tree.children.filter(Boolean).length, 4)
})

/** vm 里创建的对象与本 realm 原型不同, 结构比较先转成本 realm 的纯 JSON。 */
function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

test('draftToEntry: stdio 与 http 的必填校验和默认值', () => {
  const { __test } = loadDefinition().factory(createFakeReact)
  const t = key => key

  const stdio = __test.draftToEntry({ ...__test.emptyDraft(), name: 'demo', command: 'npx' }, t)
  assert.equal(stdio.ok, true)
  assert.equal(stdio.entry.transport, 'stdio')
  assert.equal(stdio.entry.command, 'npx')
  assert.equal(stdio.entry.enabled, true)
  assert.deepEqual(plain(stdio.entry.reconnect), { enabled: true })
  assert.equal('args' in stdio.entry, false)

  const noCommand = __test.draftToEntry({ ...__test.emptyDraft(), name: 'demo' }, t)
  assert.deepEqual(plain(noCommand), { ok: false, error: 'commandRequired' })

  const badName = __test.draftToEntry({ ...__test.emptyDraft(), name: 'bad name', command: 'x' }, t)
  assert.deepEqual(plain(badName), { ok: false, error: 'nameInvalid' })

  const http = __test.draftToEntry({
    ...__test.emptyDraft(),
    name: 'remote',
    transport: 'streamable-http',
    url: 'https://mcp.example.com/mcp',
    headersText: 'Authorization=Bearer ${credential:MCP_TOKEN}',
  }, t)
  assert.equal(http.ok, true)
  assert.deepEqual(plain(http.entry.headers), { Authorization: 'Bearer ${credential:MCP_TOKEN}' })

  const badUrl = __test.draftToEntry({ ...__test.emptyDraft(), name: 'remote', transport: 'streamable-http', url: 'ftp://x' }, t)
  assert.deepEqual(plain(badUrl), { ok: false, error: 'urlRequired' })

  const badEnv = __test.draftToEntry({ ...__test.emptyDraft(), name: 'demo', command: 'x', envText: 'TOKEN' }, t)
  assert.deepEqual(plain(badEnv), { ok: false, error: 'kvInvalid' })
})

test('mergeForSave: 保留未建模字段, 清空的建模字段不复活, 换传输时重建', () => {
  const { __test } = loadDefinition().factory(createFakeReact)
  const base = {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'old'],
    env: { TOKEN: '${credential:TOKEN}' },
    toolCallTimeoutMs: 9000,
    reconnect: { enabled: true, initialDelayMs: 250, maxAttempts: 4 },
  }

  // 表单提交了 command 与超时; args/env 未提交 => 视为用户清空, 不能从 base 复活。
  const same = __test.mergeForSave(base, { transport: 'stdio', command: 'node', enabled: true, toolCallTimeoutMs: 5000 })
  assert.equal(same.command, 'node')
  assert.equal(same.toolCallTimeoutMs, 5000)
  assert.equal('args' in same, false)
  assert.equal('env' in same, false)
  // 未建模的 reconnect 间隔/次数保留。
  assert.deepEqual(plain(same.reconnect), { enabled: true, initialDelayMs: 250, maxAttempts: 4 })

  // 只关掉重连: 其余 reconnect 字段仍保留。
  const toggled = __test.mergeForSave(base, { transport: 'stdio', command: 'node', enabled: true, reconnect: { enabled: false } })
  assert.deepEqual(plain(toggled.reconnect), { enabled: false, initialDelayMs: 250, maxAttempts: 4 })

  // 换 transport: 按新条目重建, 不留 stdio 字段。
  const switched = __test.mergeForSave(base, { transport: 'streamable-http', url: 'https://x/mcp', enabled: true })
  assert.equal('command' in switched, false)
  assert.equal('toolCallTimeoutMs' in switched, false)
  assert.equal(switched.url, 'https://x/mcp')
})

test('parseImport: 单个对象 / 数组 / servers 映射 / 裸映射', () => {
  const { __test } = loadDefinition().factory(createFakeReact)

  const single = __test.parseImport(JSON.stringify({
    name: 'pencil',
    transport: 'stdio',
    command: 'pencil.exe',
    args: ['--app', 'desktop'],
    env: {},
  }))
  assert.equal(single.ok, true)
  assert.equal(single.items.length, 1)
  assert.equal(single.items[0].name, 'pencil')
  assert.equal('name' in single.items[0].entry, false)
  assert.deepEqual(plain(single.items[0].entry), {
    transport: 'stdio', command: 'pencil.exe', args: ['--app', 'desktop'], env: {},
  })

  const array = __test.parseImport(JSON.stringify([
    { name: 'a', transport: 'stdio', command: 'x' },
    { name: 'b', transport: 'streamable-http', url: 'https://x/mcp' },
  ]))
  assert.equal(array.ok, true)
  assert.deepEqual(plain(array.items.map(item => item.name)), ['a', 'b'])

  const wrapped = __test.parseImport(JSON.stringify({
    servers: {
      a: { transport: 'stdio', command: 'x' },
      b: { transport: 'streamable-http', url: 'https://x/mcp' },
    },
  }))
  assert.equal(wrapped.ok, true)
  assert.deepEqual(plain(wrapped.items.map(item => item.name)), ['a', 'b'])
  assert.equal(wrapped.items[0].entry.command, 'x')

  const bareMap = __test.parseImport(JSON.stringify({ only: { transport: 'stdio', command: 'y' } }))
  assert.equal(bareMap.ok, true)
  assert.deepEqual(plain(bareMap.items.map(item => item.name)), ['only'])
})

test('parseImport: 非法 JSON / 结构 / 缺 name / 空列表', () => {
  const { __test } = loadDefinition().factory(createFakeReact)

  const badJson = __test.parseImport('{ not json')
  assert.equal(badJson.ok, false)
  assert.equal(badJson.error, 'json')
  assert.equal(typeof badJson.message, 'string')

  assert.deepEqual(plain(__test.parseImport('"text"')), { ok: false, error: 'shape' })
  assert.deepEqual(plain(__test.parseImport('[]')), { ok: false, error: 'empty' })

  const noName = __test.parseImport(JSON.stringify({ transport: 'stdio', command: 'x' }))
  assert.deepEqual(plain(noName), { ok: false, error: 'name' })

  const arrayWithoutName = __test.parseImport(JSON.stringify([{ transport: 'stdio', command: 'x' }]))
  assert.deepEqual(plain(arrayWithoutName), { ok: false, error: 'name' })

  const nonObjectValue = __test.parseImport(JSON.stringify({ a: 'nope' }))
  assert.deepEqual(plain(nonObjectValue), { ok: false, error: 'shape' })
})

test('probeFlags: 只在 running 期间显示测试中, 完成后按钮恢复并保留结果', () => {
  const { __test } = loadDefinition().factory(createFakeReact)

  assert.deepEqual(plain(__test.probeFlags(null, 'a')), { probing: false, result: null })

  const running = __test.probeFlags({ name: 'a', running: true, result: null }, 'a')
  assert.equal(running.probing, true)
  assert.equal(running.result, null)

  // 回归: 探测完成后 running=false, 按钮必须恢复 (此前标签会永久停在"测试中…")。
  const done = __test.probeFlags({ name: 'a', running: false, result: { ok: true, toolNames: ['ping'] } }, 'a')
  assert.equal(done.probing, false)
  assert.equal(done.result.ok, true)

  // 失败结果同样恢复按钮。
  const failed = __test.probeFlags({ name: 'a', running: false, result: { ok: false, stage: 'connect', message: 'x' } }, 'a')
  assert.equal(failed.probing, false)
  assert.equal(failed.result.ok, false)

  // 其他服务器的探测状态不影响本行。
  assert.deepEqual(plain(__test.probeFlags({ name: 'b', running: true, result: null }, 'a')), { probing: false, result: null })
})

test('图标操作按钮: 可访问名/tooltip 带服务器名, 图标 15px, 探测时显示旋转环', () => {
  const { __test } = loadDefinition().factory(createFakeReact)

  const edit = __test.IconButton({ label: '编辑 demo', onClick() {} }, __test.IconEdit())
  assert.equal(edit.type, 'button')
  assert.equal(edit.props.className, 'mcpui-btn mcpui-iconBtn')
  assert.equal(edit.props['aria-label'], '编辑 demo')
  assert.equal(edit.props.title, '编辑 demo')
  assert.equal(edit.props.disabled, false)

  const del = __test.IconButton({ label: '删除 demo', tone: 'danger', disabled: true }, __test.IconTrash())
  assert.equal(del.props['data-tone'], 'danger')
  assert.equal(del.props.disabled, true)

  for (const factory of [__test.IconPlay, __test.IconSpinner, __test.IconRestart, __test.IconEdit, __test.IconTrash, __test.IconLock]) {
    const icon = factory()
    assert.equal(icon.type, 'svg')
    assert.equal(icon.props.width, 15)
    assert.equal(icon.props.viewBox, '0 0 16 16')
    assert.equal(icon.props['aria-hidden'], 'true')
  }

  // 探测中: 旋转环 (圆环 + CSS 动画类), 结束后换回播放图标。
  const spinner = __test.IconSpinner()
  assert.equal(spinner.children[0].props.className, 'mcpui-spin')
  assert.equal(__test.IconPlay().children[0].props.fill, 'currentColor')
})

test('按钮悬停: 主按钮悬停不改底色 (回归: 通用 hover 规则曾覆盖品牌色, 文字消失)', () => {
  const { __test } = loadDefinition().factory(createFakeReact)
  const css = __test.CSS
  const rule = selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`))
    return match === null ? null : match[0]
  }

  // 通用悬停只为次要按钮提供底色 (~0,3,0)。
  const genericHover = rule('.mcpui-btn:hover:not(:disabled)')
  assert.ok(genericHover !== null, '缺少通用悬停规则')
  assert.match(genericHover, /background:\s*var\(--dsw-alias-bg-layer-2\)/)

  // 主按钮的悬停规则 (~0,4,0) 必须重新声明品牌底色, 否则会被通用规则改成浅灰层,
  // 而文字色仍是 --dsw-alias-bg-base (浅色主题接近白色) -> 白字灰底。
  const primaryHover = rule(".mcpui-btn[data-variant='primary']:hover:not(:disabled)")
  assert.ok(primaryHover !== null, '缺少主按钮悬停规则')
  assert.match(primaryHover, /background:\s*var\(--dsw-alias-brand-primary\)/)
  assert.match(primaryHover, /filter:\s*brightness\(/)

  // 实心危险按钮同样需要显式悬停规则, 否则与通用规则同特异性时没有反馈。
  const dangerHover = rule(".mcpui-btn[data-variant='danger'][data-solid='true']:hover:not(:disabled)")
  assert.ok(dangerHover !== null, '缺少实心危险按钮悬停规则')
  assert.match(dangerHover, /background:\s*var\(--dsw-alias-state-error-primary\)/)
})

test('字典: 中英文键集合一致且都非空', () => {
  const definition = loadDefinition()
  const react = createFakeReact()
  const client = createClientContext(react)
  definition.factory(() => react).apply(client)

  const dicts = client.dictionaries[0].dicts
  const zhKeys = Object.keys(dicts.zh).sort()
  const enKeys = Object.keys(dicts.en).sort()
  assert.deepEqual(enKeys, zhKeys)
  for (const key of zhKeys) {
    assert.equal(typeof dicts.zh[key], 'string')
    assert.ok(dicts.zh[key].length > 0, `zh.${key} 为空`)
    assert.ok(dicts.en[key].length > 0, `en.${key} 为空`)
  }
})

test('draftFromEntry: 反向还原表单状态', () => {
  const { __test } = loadDefinition().factory(createFakeReact)
  const draft = __test.draftFromEntry('demo', {
    transport: 'streamable-http',
    url: 'https://x/mcp',
    headers: { A: '1' },
    enabled: false,
    reconnect: { enabled: false },
    startupTimeoutMs: 5000,
  })
  assert.equal(draft.name, 'demo')
  assert.equal(draft.transport, 'streamable-http')
  assert.equal(draft.headersText, 'A=1')
  assert.equal(draft.enabled, false)
  assert.equal(draft.reconnectEnabled, false)
  assert.equal(draft.startupTimeoutMs, '5000')
})
