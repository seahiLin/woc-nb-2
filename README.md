# 员工与薪酬 · 数据报告

一份关于员工数据集的**分析报告**，不是监控大屏：先给结论，再给图，最后能查单个员工。
跑在 Cloudflare Workers 上（TanStack Start），数据来自 Neon Postgres。

## 页面结构

```
首屏      一句话结论 + 四个关键数字（在职人数 / 平均年薪 / 平均司龄 / 职衔种类）
关键发现  三张卡片：部门差异、招聘趋势、同岗性别差异
01 薪酬水平   分布直方图（标出中位数与均值）+ P25/中位/均值/P75
02 部门       每个部门的平均年薪条形 + 中位数 + 区间 + 经理
03 招聘与留存 每年招聘量与留存率 + 历年平均薪资折线
04 职衔与性别 各职衔人数/薪酬/女性占比 + 同职衔男女差异
05 薪酬最高   当前薪酬最高的十人
06 员工检索   按工号或姓名片段实时查
```

页面上的文字只讲**数据本身**：多少人、多少钱、差多少。数据源、表名、连接方式这类
实现细节不出现在页面上。

## 技术栈

| 层 | 用什么 |
| --- | --- |
| 框架 | TanStack Start（文件路由，`src/routes/`）+ React 19 |
| 样式 | Tailwind CSS v4（`src/styles.css` 里的语义 token） |
| 图表 | 手写 SVG（`src/components/charts.tsx`），不引图表库 |
| 数据库 | Neon Postgres，`drizzle-orm` + `@neondatabase/serverless` |
| 部署 | Cloudflare Workers，`wrangler` |

### Drizzle 负责什么

一切与数据库打交道的部分都由 Drizzle 统一管理：

- **表定义**：`src/db/schema.ts` 声明 Neon 上的 `employees` schema（六张表、枚举、
  序列、外键、索引、关系）。这是**唯一事实来源** —— 迁移和查询都从它来。
- **查询**：`src/lib/employees.queries.server.ts` 里的聚合全部用 Drizzle 的
  `select` / `join` / `where` / `groupBy` 写；`percentile_cont`、`filter (where ...)`
  这类 Drizzle 没有专门 API 的部分用 `sql` 模板补，参数仍走占位符。
- **迁移**：`drizzle/` 里的 SQL 由 `drizzle-kit generate` 从 schema 生成，
  部署前由 `scripts/migrate.mjs` 应用。
- **D1 快照**：`src/db/snapshot-schema.ts` + `drizzle-orm/d1`，读写同一套 API。

## 数据

- **Neon** 是唯一数据源。连接用官方驱动 `@neondatabase/serverless` 的 `Pool`
  （WebSocket 上的 node-postgres 协议），包在 `drizzle-orm/neon-serverless` 里。
  连接串来自 Worker secret `CONNECTION_STRING`，只在服务端读取。
- 一次页面加载在**同一个只读事务**（`repeatable read`）里跑完所有聚合，所以每个数字
  都来自同一个快照。
- **D1**（`env.DB`）只存一份聚合结果的 JSON 快照，用于在 Neon 暂时不可用时兜底。

### 口径

- `to_date = '9999-01-01'` 视为“当前有效”。
- 数据集基准日（`asOf`）取薪资历史里最后一个真实结束日的次日 —— 本数据集是
  **2002-08-02**。不写死，换一份数据集也能自动对上。
- 300,024 人曾在这份数据里出现，其中 240,124 人在基准日仍在职。

## 迁移

两个库，两套迁移，各归各位：

| 库 | 目录 | 谁跑 | 内容 |
| --- | --- | --- | --- |
| **Neon**（Postgres） | `drizzle/*.sql` | `scripts/migrate.mjs`，部署前 | `employees` schema |
| **D1**（SQLite） | `migrations/*.sql` | `wrangler d1 migrations apply` | 只有看板快照表 |

`npm run release` / `release:preview` 先跑 Neon 迁移，再跑 D1 迁移，两个库都在 Worker
上线前就绪。

### Neon 侧

```bash
npm run db:generate   # 改了 src/db/schema.ts 之后生成迁移
npm run db:check      # 检查迁移历史有没有分叉
npm run migrate       # 手动应用（部署时由 release 自动跑）
```

`drizzle/0000_employees_schema.sql` 是基线，逐项对齐原数据集导入后的实际结构：
列类型与长度、`employee_gender` 枚举、`id_employee_seq` 序列、主键/外键名
（`idx_16988_primary`、`dept_emp_ibfk_1` …）、9 个索引。全部写成幂等语句，所以对已有
数据的库跑一遍是 no-op，只在 `drizzle.__drizzle_migrations` 里记一行。

执行器只在 **main** 上真正应用：分支 Preview 用同一套 Neon 连接串，如果它们也跑迁移，
一次 push 就会改到生产库。非 main 只报告待应用的迁移（dry-run）。要单独对某个 Neon
分支库应用，设 `NEON_MIGRATE=apply`。

连不上 Neon 只警告不阻断部署（页面会退到 D1 快照）；连上了但迁移报错则回滚并让部署失败。

### D1 侧

只存一份聚合结果的 JSON 快照。`0004_snapshot_only.sql` 确保这张表存在，并删掉了早期
`0001` 用 SQLite 语法重建的那六张 `employees` 影子表 —— 它们从来没被页面读过。
`0001`–`0003` 留在仓库里只是为了迁就已部署库的 `d1_migrations` 历史。

## 本地开发

```bash
npm install
npm run dev
```

需要在 `.dev.vars` 里提供 `CONNECTION_STRING`（不要提交这个文件）。

## 目录

```
src/db/
  schema.ts                   # Neon employees schema 的 Drizzle 定义（迁移 + 查询的事实来源）
  snapshot-schema.ts          # D1 快照表的 Drizzle 定义
src/lib/
  neon.server.ts              # Pool + drizzle 实例，每个请求用完即关
  employees.queries.server.ts # 报告用到的全部查询（一个只读事务）
  snapshot.server.ts          # D1 快照读写（drizzle-orm/d1）
  worker-env.server.ts        # 读取 Worker secret / D1 binding
  dashboard.functions.ts      # 服务端函数（页面唯一入口）
  dashboard-types.ts          # 前后端共享的数据结构
src/components/charts.tsx     # 手写 SVG 图表原语 + 格式化
src/routes/index.tsx          # 报告页面
drizzle/                      # drizzle-kit 生成的迁移与快照
migrations/                   # D1 迁移
scripts/migrate.mjs           # Neon 迁移执行器（部署前跑）
```

## 设计

暖白纸面 + 深墨字 + 一点朱红，取向是**排版讲究的分析报告**：

- 颜色全部走语义 token（`--color-ink` / `--color-rule` / `--color-accent`），
  图表里的 `currentColor` 会自动跟随。
- 每节先给一句人话结论（“大多数人集中在 $65K–$75K”），再给图。
- 数字统一 `font-variant-numeric: tabular-nums`，表格和 KPI 才能对齐。
- 图表不引第三方库：数据量小、形状固定，手写更可控也不给客户端加体积。
