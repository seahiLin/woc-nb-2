/**
 * 页面与 Neon 之间唯一的桥（服务端函数）。
 *
 * - 连接串从 Worker secret `CONNECTION_STRING` 读取，只存在于服务端。
 * - 每次成功查询后，把聚合结果顺手写进 D1 快照表；Neon 抽风时页面
 *   还能展示“最近一次成功的数据”，并明确标注为缓存。
 *
 * `*.server.ts` 在客户端构建里会被 TanStack Start 的 import protection
 * 拦掉，所以这里引用的数据库代码不会进浏览器。
 */

import { createServerFn } from '@tanstack/react-start'
import type { Dashboard, EmployeeRow } from './dashboard-types'
import { loadDashboard, searchEmployees } from './employees.queries.server'
import { neonPing } from './neon.server'
import { readSnapshot, writeSnapshot } from './snapshot.server'
import { connectionString } from './worker-env.server'

export interface DashboardResult {
  dashboard: Dashboard | null
  error: string | null
  /** Neon 是否可用（决定页面上那枚状态灯）。 */
  live: boolean
}

/** 拉取整份看板数据。 */
export const getDashboard = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DashboardResult> => {
    try {
      const dashboard = await loadDashboard(connectionString())
      await writeSnapshot(dashboard)
      return { dashboard, error: null, live: true }
    } catch (error) {
      const snapshot = await readSnapshot()
      const message = error instanceof Error ? error.message : 'Neon 查询失败'
      return { dashboard: snapshot, error: message, live: false }
    }
  },
)

/** 员工检索：按工号 / 姓 / 名。 */
export const findEmployees = createServerFn({ method: 'GET' })
  .validator((data: { term: string }) => ({ term: String(data?.term ?? '').slice(0, 40) }))
  .handler(async ({ data }): Promise<{ rows: EmployeeRow[]; error: string | null }> => {
    const term = data.term.trim()
    if (!term) return { rows: [], error: null }

    try {
      return { rows: await searchEmployees(connectionString(), term), error: null }
    } catch (error) {
      return {
        rows: [],
        error: error instanceof Error ? error.message : 'Neon 查询失败',
      }
    }
  })

/** 连接自检：给页面一个“重新连接 Neon”的按钮。 */
export const pingNeon = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ ok: boolean; database: string | null; error: string | null }> => {
    try {
      return { ok: true, database: await neonPing(connectionString()), error: null }
    } catch (error) {
      return {
        ok: false,
        database: null,
        error: error instanceof Error ? error.message : 'Neon 不可用',
      }
    }
  },
)
