/**
 * Worker 运行时环境（服务端专用）。
 *
 * 只在 `.handler()` 里被动态 import，所以 `cloudflare:workers`
 * 永远不会被打进浏览器包。
 */

import { env } from 'cloudflare:workers'

/** 只声明用到的那一点点 D1 API，避免依赖 workers 类型包。 */
export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>
      run(): Promise<unknown>
    }
  }
}

interface WorkerEnv {
  CONNECTION_STRING?: string
  DB?: D1Like
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
    throw new Error(
      '缺少 CONNECTION_STRING。请在 Tria 的 Secrets 里为这个 Worker 配置 Neon 连接串。',
    )
  }
  return value
}

export function d1(): D1Like | null {
  return readWorkerEnv().DB ?? null
}
