/**
 * Worker 运行时环境（服务端专用）。
 *
 * 只在 `.handler()` 里被动态 import，所以 `cloudflare:workers`
 * 永远不会被打进浏览器包。
 */

import { env } from 'cloudflare:workers'

interface WorkerEnv {
  CONNECTION_STRING?: string
  /** D1 binding。类型由 `drizzle-orm/d1` 负责，这里只当不透明句柄。 */
  DB?: unknown
}

export function readWorkerEnv(): WorkerEnv {
  return (env ?? {}) as unknown as WorkerEnv
}

/** Neon 连接串：优先 Worker secret，其次 process.env（本地 dev）。 */
export function connectionString(): string {
  const runtime = readWorkerEnv()
  const fallback =
    typeof process !== 'undefined' ? process.env?.CONNECTION_STRING : undefined
  const value = runtime.CONNECTION_STRING ?? fallback

  if (!value) {
    throw new Error('数据库连接尚未配置。')
  }
  return value
}

/** D1 binding（没配就是 null）。 */
export function d1Binding(): unknown | null {
  return readWorkerEnv().DB ?? null
}
