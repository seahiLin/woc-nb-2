/**
 * Neon 连接层：`@neondatabase/serverless` 的 `Pool`（WebSocket，node-postgres API）
 * + `drizzle-orm/neon-serverless`。
 *
 * 为什么用 WebSocket 而不是 HTTP：
 *   - 看板一次要跑十来条聚合查询，它们在同一个只读事务里、走同一条连接，
 *     所有数字才来自同一个快照。
 *   - 连接不能跨请求存活，所以每个请求自己开一个 Pool，用完就 `end()`。
 *   - Workers 自带全局 `WebSocket`，不需要像 Node 那样塞 `ws`。
 *
 * 连接串来自 Worker secret `CONNECTION_STRING`，只在服务端读取。
 */

import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import type { NeonDatabase, NeonQueryResultHKT } from 'drizzle-orm/neon-serverless'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '../db/schema'

/** 带完整 schema 的 Drizzle 实例（表、枚举、序列、关系都在里面）。 */
export type Db = NeonDatabase<typeof schema>

/**
 * “能跑查询的东西”：`Db` 和事务里的 `tx` 都满足（两者都继承自 `PgDatabase`）。
 * 查询函数都收这个类型，才能在 `db.transaction(...)` 内外复用。
 */
export type Queryable = PgDatabase<NeonQueryResultHKT, typeof schema>

export class NeonError extends Error {
  code?: string
  detail?: string

  constructor(message: string) {
    super(message)
    this.name = 'NeonError'
  }
}

/**
 * 开一个连接，跑完就关。
 *
 * `run` 拿到的 `db` 支持 `db.select()` / `db.transaction()` 等全部 Drizzle API；
 * 事务请用 `db.transaction(...)`，它会固定在同一个底层连接上。
 */
export async function withDb<T>(
  connectionString: string,
  run: (db: Db) => Promise<T>,
): Promise<T> {
  if (!connectionString) {
    throw new NeonError('数据库连接尚未配置。')
  }

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10_000,
    max: 1,
  })

  try {
    return await run(drizzle({ client: pool, schema }))
  } catch (error) {
    const cause = error as { message?: string; code?: string; detail?: string }
    const wrapped = new NeonError(cause?.message ?? '数据库查询失败')
    wrapped.code = cause?.code
    wrapped.detail = cause?.detail
    throw wrapped
  } finally {
    // Workers 里连接不能跨请求存活，必须在本请求内关掉。
    await pool.end().catch(() => undefined)
  }
}

/** 从连接串里取出库名（只用于展示，不参与连接）。 */
export function databaseName(connectionString: string): string {
  try {
    const url = new URL(connectionString)
    return decodeURIComponent(url.pathname.replace(/^\//, '')) || 'neondb'
  } catch {
    return 'neondb'
  }
}
