import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit 的配置。
 *
 *   npx drizzle-kit generate   # 改了 src/db/schema.ts 之后生成迁移 SQL + 快照
 *   npx drizzle-kit check      # 检查迁移历史有没有分叉
 *
 * 应用迁移不用 drizzle-kit，而是 `scripts/migrate.mjs`（部署前跑）——它用
 * `drizzle-orm/neon-serverless/migrator`，和运行时同一个驱动，也不需要在 CI
 * 里额外配置 drizzle-kit 的连接串。
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.CONNECTION_STRING ?? '',
  },
})
