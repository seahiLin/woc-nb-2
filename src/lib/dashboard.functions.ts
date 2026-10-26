/**
 * 页面与数据库之间唯一的桥（服务端函数）。
 *
 * - 连接串从 Worker secret `CONNECTION_STRING` 读取，只存在于服务端。
 * - 每次成功查询后，把聚合结果顺手写进 D1 快照。快照有两个用处：
 *   1. 十分钟内再打开页面直接用它，不必重跑那十来条聚合查询；
 *   2. 数据库暂时不可用时兜底，页面标注为缓存。
 *
 * `*.server.ts` 在客户端构建里会被 TanStack Start 的 import protection
 * 拦掉，所以这里引用的数据库代码不会进浏览器。
 */

import { createServerFn } from '@tanstack/react-start'
import type { Dashboard, SearchResult } from './dashboard-types'
import { loadDashboard, searchEmployees } from './employees.queries.server'
import { readSnapshot, writeSnapshot } from './snapshot.server'
import { connectionString } from './worker-env.server'

/** 快照多久之内可以直接复用。 */
const SNAPSHOT_TTL_MS = 10 * 60 * 1000

export interface DashboardResult {
  dashboard: Dashboard | null
  error: string | null
}

function snapshotAge(dashboard: Dashboard): number {
  const time = Date.parse(dashboard.generatedAt)
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : Date.now() - time
}

/** 拉取整份看板数据。`force` 跳过快照、强制回源。 */
export const getDashboard = createServerFn({ method: 'GET' })
  .validator((data: { force?: boolean } | undefined) => ({ force: Boolean(data?.force) }))
  .handler(async ({ data }): Promise<DashboardResult> => {
    // 先看快照：够新就直接用，页面打开几乎瞬时。
    const cached = await readSnapshot()
    if (!data.force && cached && snapshotAge(cached) < SNAPSHOT_TTL_MS) {
      return { dashboard: cached, error: null }
    }

    try {
      const dashboard = await loadDashboard(connectionString())
      await writeSnapshot(dashboard)
      return { dashboard, error: null }
    } catch (error) {
      return {
        dashboard: cached,
        error: error instanceof Error ? error.message : '查询失败',
      }
    }
  })

/** 员工检索：按工号 / 姓 / 名。 */
export const findEmployees = createServerFn({ method: 'GET' })
  .validator((data: { term: string }) => ({ term: String(data?.term ?? '').slice(0, 40) }))
  .handler(async ({ data }): Promise<SearchResult> => {
    const term = data.term.trim()
    if (!term) return { rows: [], truncated: false, error: null }

    try {
      const { rows, truncated } = await searchEmployees(connectionString(), term)
      return { rows, truncated, error: null }
    } catch (error) {
      return {
        rows: [],
        truncated: false,
        error: error instanceof Error ? error.message : '查询失败',
      }
    }
  })

