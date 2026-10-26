/**
 * 应用 Neon 上的 Drizzle 迁移 —— 部署前由 `npm run release` /
 * `npm run release:preview` 调用。
 *
 * 迁移文件在 `drizzle/`，由 `drizzle-kit generate` 从 `src/db/schema.ts` 生成；
 * 这里用 `drizzle-orm/neon-serverless/migrator` 应用，和运行时同一个驱动、
 * 同一套 schema 定义，不需要在 CI 里另外配 drizzle-kit 的连接。
 *
 * 只在 main 上真正应用：无法从仓库里确认 Preview 的连接串指向哪个 Neon 库，
 * 若它也指向生产库，一次 push 就会改到生产 schema。非 main 只报告待应用的
 * 迁移（dry-run）。确认 Preview 指向独立的 Neon 分支后，可以放开这里，
 * 或临时设 `NEON_MIGRATE=apply`。
 *
 * 失败策略：
 *   * 没有连接串 / 连不上 Neon → 只警告，不阻断部署（页面会退到快照）。
 *   * 连上了但迁移报错 → 事务回滚，退出码 1，部署停下。
 */

import { existsSync } from 'node:fs'
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'

const MIGRATIONS_FOLDER = 'drizzle'

const log = (message) => console.log(`[migrate] ${message}`)
const warn = (message) => console.warn(`[migrate] ${message}`)

/** 本地直接跑（没有 GITHUB_REF）或 main 分支上才真正应用。 */
function shouldApply() {
  if (process.env.NEON_MIGRATE === 'apply') return true
  if (process.env.NEON_MIGRATE === 'check') return false
  const ref = process.env.GITHUB_REF
  return !ref || ref === 'refs/heads/main'
}

async function run() {
  if (!existsSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`)) {
    warn(`没有 ${MIGRATIONS_FOLDER}/meta/_journal.json，跳过。`)
    return
  }

  const pending = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER })
  if (pending.length === 0) {
    log('没有迁移文件，跳过。')
    return
  }

  const connectionString = process.env.CONNECTION_STRING?.trim()
  if (!connectionString) {
    warn('没有 CONNECTION_STRING，跳过 Neon 迁移（页面会退到 D1 快照）。')
    return
  }

  if (typeof globalThis.WebSocket !== 'function') {
    throw new Error('当前 Node 没有全局 WebSocket（需要 Node 22+），无法用 Pool 跑迁移。')
  }

  const pool = new Pool({ connectionString, max: 1 })
  let client
  try {
    client = await pool.connect()
  } catch (error) {
    await pool.end().catch(() => undefined)
    warn(`连不上 Neon，跳过迁移：${error?.message ?? error}`)
    return
  }

  try {
    if (!shouldApply()) {
      // dry-run：只读地看一眼已经应用到哪儿了，不改库。
      const { rows } = await client.query(
        "select to_regclass('drizzle.__drizzle_migrations') as table_name",
      )
      const applied = rows[0]?.table_name
        ? (
            await client.query(
              'select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1',
            )
          ).rows[0]?.created_at
        : undefined

      const outstanding = pending.filter(
        (migration) => applied === undefined || Number(applied) < migration.folderMillis,
      )
      if (outstanding.length === 0) {
        log('已是最新，没有待应用的迁移。')
      } else {
        warn(
          `有 ${outstanding.length} 个 Neon 迁移待应用。分支 Preview 不应用迁移，` +
            '合并到 main 后会自动跑（或用 NEON_MIGRATE=apply 单独应用）。',
        )
      }
      return
    }

    const db = drizzle({ client })
    log(`应用 ${MIGRATIONS_FOLDER} 里的迁移 …`)
    await migrate(db, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    })
    log('完成。')
  } catch (error) {
    console.error(`[migrate] 迁移失败：${error?.message ?? error}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end().catch(() => undefined)
  }
}

await run()
