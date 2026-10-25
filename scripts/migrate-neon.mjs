/**
 * Neon（Postgres）迁移执行器 —— 部署前由 `npm run release` /
 * `npm run release:preview` 调用。
 *
 * 流程：
 *   1. 从 `CONNECTION_STRING` 拿连接串（production / preview 各一份，由 Tria 注入）。
 *   2. 开一个事务，先拿一把 advisory lock，避免两个部署同时跑迁移时互相踩。
 *   3. 建 `public.schema_migrations`，读出已应用的文件名。
 *   4. 按文件名顺序执行 `neon/migrations/*.sql` 里还没应用的文件，并记账。
 *
 * 为什么用 `Pool`（WebSocket，node-postgres API）而不是 HTTP 的 `neon()`：
 * 一个迁移文件里有多条语句、还有 `do $$ … $$` 块，只有简单查询协议能整段
 * 发出去并整体落在同一个事务里。Node 22 自带全局 WebSocket，不用额外装 ws。
 *
 * 只在 main 上真正执行：
 *   Tria 的每个分支 Preview 都用同一套 Neon 连接串，如果分支部署也跑迁移，
 *   一次 push 就会改到生产库的 schema。所以非 main 的分支只做 dry-run ——
 *   把待应用的迁移打出来，不落库。想在某条分支上真的应用（比如连接串指向
 *   一个 Neon 分支库），加 `NEON_MIGRATE=apply`。
 *
 * 失败策略：
 *   * 没有连接串 / 连不上 Neon → 只警告，不阻断部署（页面会退到 D1 快照）。
 *   * 连上了但某个迁移报错 → 整个事务回滚，退出码 1，部署停下。
 *
 * 迁移文件必须幂等（`create … if not exists` 之类）：这套结构已经存在于线上
 * 库里，第一次跑 0001 时它应该什么都不改，只留下一条记账。
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Pool } from '@neondatabase/serverless'

const MIGRATIONS_DIR = 'neon/migrations'
/** 固定值，代表“这个库的 schema 迁移”这一把锁。 */
const LOCK_KEY = 4_902_117_331

const log = (message) => console.log(`[neon-migrate] ${message}`)
const warn = (message) => console.warn(`[neon-migrate] ${message}`)

/** 本地直接跑（没有 GITHUB_REF）或 main 分支上才真正应用。 */
function shouldApply() {
  if (process.env.NEON_MIGRATE === 'apply') return true
  if (process.env.NEON_MIGRATE === 'check') return false
  const ref = process.env.GITHUB_REF
  return !ref || ref === 'refs/heads/main'
}

async function migrationFiles() {
  let entries
  try {
    entries = await readdir(MIGRATIONS_DIR)
  } catch {
    warn(`没有 ${MIGRATIONS_DIR} 目录，跳过。`)
    return []
  }
  // 文件名前缀就是顺序（0001_、0002_…），字典序即执行序。
  return entries.filter((name) => name.endsWith('.sql')).sort()
}

async function migrate() {
  const files = await migrationFiles()
  if (files.length === 0) return

  const apply = shouldApply()

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
    await client.query('begin')
    // 事务级 advisory lock：跑完（或回滚）自动释放，不会留在连接上。
    await client.query('select pg_advisory_xact_lock($1::bigint)', [LOCK_KEY])

    if (apply) {
      await client.query(`
        create table if not exists public.schema_migrations (
          name       text primary key,
          applied_at timestamptz not null default now()
        )
      `)
    }

    // dry-run 时不能建表（会被回滚掉），所以先看它存不存在。
    const { rows: existing } = await client.query(
      "select to_regclass('public.schema_migrations') as table_name",
    )
    const { rows } = existing[0]?.table_name
      ? await client.query('select name from public.schema_migrations')
      : { rows: [] }

    const applied = new Set(rows.map((row) => row.name))
    const pending = files.filter((name) => !applied.has(name))

    if (pending.length === 0) {
      log(`已是最新（${files.length} 个迁移文件全部应用过）。`)
    } else if (!apply) {
      // 分支 Preview：只报告，不改生产库。
      warn(
        `有 ${pending.length} 个 Neon 迁移待应用（${pending.join('、')}）。` +
          '分支 Preview 不应用迁移，合并到 main 后会自动跑。',
      )
    } else {
      for (const name of pending) {
        const sql = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8')
        log(`应用 ${name} …`)
        await client.query(sql)
        await client.query(
          'insert into public.schema_migrations (name) values ($1) on conflict (name) do nothing',
          [name],
        )
      }
      log(`完成，应用了 ${pending.length} 个迁移文件。`)
    }

    await client.query(apply ? 'commit' : 'rollback')
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await pool.end().catch(() => undefined)
  }
}

try {
  await migrate()
} catch (error) {
  console.error(`[neon-migrate] 迁移失败：${error?.message ?? error}`)
  process.exitCode = 1
}
