/**
 * Neon 连接层：用官方 `@neondatabase/serverless` 驱动，走真正的 Postgres 协议。
 *
 * 为什么是 `Pool`（WebSocket）而不是 `neon()`（HTTP）：
 *   - `Pool` / `Client` 就是 node-postgres 的 API，跑的是标准的 Postgres
 *     握手、扩展查询协议（Parse/Bind/Execute）和真正的服务端事务，类型
 *     解析也交给 pg 的 type parser。
 *   - Workers 自带全局 `WebSocket`，不需要像 Node 那样塞 `ws`。
 *   - 连接不能跨请求存活，所以每个请求自己开一个 Pool，用完就 `end()`。
 *
 * 连接串来自 Worker secret `CONNECTION_STRING`，只在服务端读取。
 */

import { Pool } from '@neondatabase/serverless'

/** 只声明用到的那一点 pg API，避免把驱动的内部类型带进业务代码。 */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>
}

export type QueryResultRow = Record<string, unknown>

/** 已建立的连接：能跑查询，也能还回去。 */
interface ConnectedClient extends Queryable {
  release(): void
}

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
 * 注意用 `connect()` 而不是 `pool.query()`：后者每次调用可能拿到不同的
 * 底层连接，`begin` / `commit` 就会落到别的连接上，事务形同虚设。
 */
export async function withClient<T>(
  connectionString: string,
  run: (db: Queryable) => Promise<T>,
): Promise<T> {
  if (!connectionString) {
    throw new NeonError('缺少 CONNECTION_STRING。请在 Tria 的 Secrets 里配置 Neon 连接串。')
  }

  const pool = new Pool({
    connectionString,
    // Workers 里不能长期挂着连接；超时就失败，让页面走 D1 快照。
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
    max: 1,
  })

  let client: ConnectedClient
  try {
    client = (await pool.connect()) as unknown as ConnectedClient
  } catch (error) {
    await pool.end().catch(() => undefined)
    const cause = error as { message?: string }
    throw new NeonError(cause?.message ?? '无法连接 Neon')
  }

  try {
    return await run(client)
  } catch (error) {
    const cause = error as { message?: string; code?: string; detail?: string }
    const wrapped = new NeonError(cause?.message ?? 'Neon 查询失败')
    wrapped.code = cause?.code
    wrapped.detail = cause?.detail
    throw wrapped
  } finally {
    client.release()
    // Workers 里连接不能跨请求存活，必须在本请求内关掉。
    await pool.end().catch(() => undefined)
  }
}

/** 单条参数化查询（`$1`、`$2`… 占位符）。 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  connectionString: string,
  text: string,
  values: unknown[] = [],
): Promise<R[]> {
  return withClient(connectionString, async (db) => {
    const result = await db.query<R>(text, values)
    return result.rows
  })
}

/**
 * 多条语句放在同一个只读事务里跑，保证看板各切片的取数口径一致。
 * 结果按传入顺序返回。
 */
export async function readOnlyBatch(
  connectionString: string,
  statements: string[],
): Promise<QueryResultRow[][]> {
  return withClient(connectionString, async (db) => {
    await db.query('begin transaction read only')
    try {
      const results: QueryResultRow[][] = []
      for (const statement of statements) {
        const result = await db.query(statement)
        results.push(result.rows)
      }
      await db.query('commit')
      return results
    } catch (error) {
      await db.query('rollback').catch(() => undefined)
      throw error
    }
  })
}

/** 在 Neon 里跑一条 `current_database()`，作为“连得上吗”的探针。 */
export async function neonPing(connectionString: string): Promise<string> {
  const rows = await query<{ db: string }>(connectionString, 'select current_database() as db')
  return String(rows[0]?.db ?? '')
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
