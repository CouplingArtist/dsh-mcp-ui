/**
 * dsh-mcp-manager-ui 宿主半边: 注册仅本机回环的 `/api/mcp-manager` 路由。
 *
 * 行为全部在 lib/host/ 下 (纯函数 + HTTP 处理), 这里只做服务解析与注册,
 * 便于用 node --test 覆盖而无需运行整个 Harness。
 */
import { createApiHandler, ENDPOINT } from './lib/host/api.js'

export const name = 'mcp-manager-ui'

export const inject = ['webServer']

/** 本机回环判定: 只接受 127.0.0.1 / ::1 的请求。 */
function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

export function apply(ctx) {
  const handler = createApiHandler({
    get: service => ctx.get(service),
    isLocal: isLoopback,
    logger: ctx.logger ?? console,
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ENDPOINT,
    handler,
  }), 'mcp-manager-ui: http route')
}
