/**
 * D1 里的看板快照：Neon 是唯一数据源，这里只是“最近一次成功”的备份。
 */

import type { Dashboard } from './dashboard-types'
import { d1 } from './worker-env.server'

const SNAPSHOT_ID = 1

export async function readSnapshot(): Promise<Dashboard | null> {
  const db = d1()
  if (!db) return null
  try {
    const row = await db
      .prepare('select payload, synced_at from employees_dashboard_snapshot where id = ?')
      .bind(SNAPSHOT_ID)
      .first<{ payload: string; synced_at: string }>()
    if (!row?.payload) return null
    const payload = JSON.parse(row.payload) as Dashboard
    return { ...payload, source: 'cache', generatedAt: row.synced_at }
  } catch {
    // 快照表还没建好（迁移未跑）时静默跳过。
    return null
  }
}

export async function writeSnapshot(dashboard: Dashboard): Promise<void> {
  const db = d1()
  if (!db) return
  try {
    await db
      .prepare(
        `insert into employees_dashboard_snapshot (id, payload, source, synced_at, row_count)
         values (?, ?, ?, ?, ?)
         on conflict (id) do update set
           payload = excluded.payload,
           source = excluded.source,
           synced_at = excluded.synced_at,
           row_count = excluded.row_count`,
      )
      .bind(
        SNAPSHOT_ID,
        JSON.stringify(dashboard),
        `${dashboard.database}/employees`,
        dashboard.generatedAt,
        dashboard.totals.employees,
      )
      .run()
  } catch {
    // 写快照失败不影响页面。
  }
}
