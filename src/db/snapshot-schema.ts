/**
 * D1（SQLite）上唯一的表：看板快照。
 *
 * Neon 是唯一数据源，这张表只留最近一次成功拉取到的聚合结果（JSON）。
 * 看板要跑十来条聚合查询（薪资表 280 万行），把结果留一份在边缘，页面
 * 第二次打开几乎是瞬时的；Neon 临时不可用时也还能展示最近一次的数据。
 *
 * 表结构由 `migrations/0004_snapshot_only.sql` 建立（D1 的迁移由
 * `wrangler d1 migrations apply` 应用），这里只是给 Drizzle 的类型定义。
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const dashboardSnapshot = sqliteTable('employees_dashboard_snapshot', {
  id: integer('id').primaryKey(),
  payload: text('payload').notNull(),
  source: text('source').notNull(),
  syncedAt: text('synced_at').notNull(),
  rowCount: integer('row_count').notNull().default(0),
})
