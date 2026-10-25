/**
 * D1 里的看板快照：Neon 是唯一数据源，这里只是“最近一次成功”的备份，
 * 顺便让第二次打开页面不用再跑那十来条聚合查询。
 *
 * 读写都走 Drizzle（`drizzle-orm/d1`），表定义在 `src/db/snapshot-schema.ts`。
 */

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { Dashboard } from './dashboard-types'
import { dashboardSnapshot } from '../db/snapshot-schema'
import { d1Binding } from './worker-env.server'

const SNAPSHOT_ID = 1

function snapshotDb() {
  const binding = d1Binding()
  if (!binding) return null
  // 只声明用到的那一点 D1 API（wrangler 的类型包不在依赖里）。
  return drizzle(binding as Parameters<typeof drizzle>[0])
}

export async function readSnapshot(): Promise<Dashboard | null> {
  const db = snapshotDb()
  if (!db) return null
  try {
    const [row] = await db
      .select({ payload: dashboardSnapshot.payload, syncedAt: dashboardSnapshot.syncedAt })
      .from(dashboardSnapshot)
      .where(eq(dashboardSnapshot.id, SNAPSHOT_ID))
      .limit(1)

    if (!row?.payload) return null
    const payload = JSON.parse(row.payload) as Dashboard
    return { ...payload, source: 'cache', generatedAt: row.syncedAt }
  } catch {
    // 快照表还没建好（迁移未跑）时静默跳过。
    return null
  }
}

export async function writeSnapshot(dashboard: Dashboard): Promise<void> {
  const db = snapshotDb()
  if (!db) return
  try {
    await db
      .insert(dashboardSnapshot)
      .values({
        id: SNAPSHOT_ID,
        payload: JSON.stringify(dashboard),
        source: `${dashboard.database}/employees`,
        syncedAt: dashboard.generatedAt,
        rowCount: dashboard.totals.employees,
      })
      .onConflictDoUpdate({
        target: dashboardSnapshot.id,
        set: {
          payload: JSON.stringify(dashboard),
          source: `${dashboard.database}/employees`,
          syncedAt: dashboard.generatedAt,
          rowCount: dashboard.totals.employees,
        },
      })
  } catch {
    // 写快照失败不影响页面。
  }
}
