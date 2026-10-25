# woc-nb-2 · 员工数据分析报告

TanStack Start 应用，跑在 Cloudflare Workers 上。页面是一份关于 Neon Postgres
`employees` 数据集的**分析报告**（不是那种一屏几十个数字的监控大屏）：规模与薪酬总览、
薪酬分布、招聘节奏与留存、部门画像、职衔结构与同岗性别差异、薪酬趋势、薪酬最高名单，
最后带一个直接打库的员工检索。

## 数据源

- **Neon**（唯一数据源）：库 `neondb`，schema `employees`，六张表 ——
  `employee` / `department` / `department_employee` / `department_manager` / `salary` / `title`。
  连接用官方驱动 `@neondatabase/serverless`，走真正的 Postgres 协议（WebSocket 上的
  `Pool` / `Client`，即 node-postgres 的 API，而非 HTTP 单次查询）。连接串来自 Worker
  secret `CONNECTION_STRING`，只在服务端读取，不会下发到浏览器。
- **D1**（`env.DB`，可选）：只存一份看板聚合结果的 JSON 快照。Neon 连不上时页面回退到
  这份快照，并把状态灯标成“缓存”，而不是直接白屏。

### 口径

- `to_date = '9999-01-01'` 视为“当前有效”。
- 数据集基准日（`asOf`）取薪资历史里最后一个真实结束日的次日，本数据集是 **2002-08-02**。
  不写死，换一份数据集也能自动对上。所有“在职 / 当前薪酬 / 司龄”都相对这一天。
- 300,024 人曾在这份数据里出现，其中 240,124 人在基准日仍在职。

## 目录

```
neon/migrations/
  0001_employees_schema.sql              # Neon 上 employees schema 的权威结构
migrations/                             # D1（SQLite）侧的迁移，wrangler 默认目录
  0001–0003                              # 早期的 employees 结构镜像（已废弃，留着凑历史）
  0004_snapshot_only.sql                 # 只留看板快照表，删掉那六张影子表
scripts/
  migrate-neon.mjs                       # Neon 迁移执行器（部署前跑）
src/lib/
  neon.server.ts              # Neon 驱动封装（Pool/Client，每个请求用完即关）
  employees.queries.server.ts # 报告用到的全部 SQL（一次只读事务）
  snapshot.server.ts          # D1 快照读写
  worker-env.server.ts        # 读取 Worker secret / D1 binding
  dashboard.functions.ts      # 服务端函数（页面唯一入口）
  dashboard-types.ts          # 前后端共享的数据结构
src/components/charts.tsx     # 手写 SVG 图表原语 + 格式化
src/routes/index.tsx          # 报告页面
```

## 设计

浅色纸面 + 细线 + 等宽数字，取向是**印出来的分析报告**而非深色监控大屏：

- 颜色全部走语义 token（`--color-ink` / `--color-rule` / `--color-accent`），图表里的
  `currentColor` 和 `text-ink-faint` 会自动跟随。
- 每个小节都有编号、一句导语和右侧注释 —— 先给结论，再给图。
- 图表不引第三方库，全是手写 SVG：数据量小、形状固定，手写更可控也不给客户端加体积。
- 数字统一 `font-variant-numeric: tabular-nums`，表格和 KPI 才能对齐。

## 迁移

两个库，两套迁移，各归各位：

| 库 | 目录 | 谁跑 | 内容 |
| --- | --- | --- | --- |
| **Neon**（Postgres） | `neon/migrations/*.sql` | `scripts/migrate-neon.mjs`，部署前 | `employees` schema 的权威结构 |
| **D1**（SQLite） | `migrations/*.sql` | `wrangler d1 migrations apply` | 只有看板快照表 |

`npm run release` / `release:preview` 会先跑 Neon 迁移，再跑 D1 迁移，所以两个库
都在 Worker 上线之前就绪。

### Neon 侧

`neon/migrations/0001_employees_schema.sql` 是**权威定义**，逐项对齐原数据集导入后的
实际结构：列类型与长度（`bigint` / `varchar(14)` / `char(4)` / `date`）、
`employees.employee_gender` 枚举、`employees.id_employee_seq` 序列、主键与外键名
（`idx_16988_primary` / `dept_emp_ibfk_1` …）、以及那 9 个索引。全部写成幂等语句，
所以对已有数据的库跑一遍是 no-op，只会在 `public.schema_migrations` 里记一行。

执行器用 `@neondatabase/serverless` 的 `Pool`（WebSocket，node-postgres API）：一个
文件里可能有多条语句和 `do $$ … $$` 块，只有简单查询协议能整段发出去并整体落在
同一个事务里。事务里先拿 `pg_advisory_xact_lock`，两个部署同时跑迁移时不会互相踩。

只在 **main** 上真正应用：分支 Preview 用同一套 Neon 连接串，如果它们也跑迁移，
一次 push 就会改到生产库的 schema。所以非 main 只做 dry-run（把待应用的迁移打到
日志里）。要单独对某个 Neon 分支库应用，设 `NEON_MIGRATE=apply`。

连不上 Neon 只警告不阻断部署（页面会退到 D1 快照）；连上了但迁移报错则回滚并让
部署失败。

### D1 侧

只存一份看板聚合结果的 JSON 快照。`0004_snapshot_only.sql` 确保这张表存在，
并删掉了早期 `0001` 用 SQLite 语法重建的那六张 `employees` 影子表 —— 它们从来没被
页面读过，留在 D1 里只会让人以为数据在那边。

`0001`–`0003` 留在仓库里只是为了迁就已部署库的 `d1_migrations` 历史：`wrangler` 只
按文件名对比，所以它们不会重跑，新库也能从头跑出同样的结果。

## 本地开发

```bash
npm install
npm run dev
```

需要在 `.dev.vars` 里提供 `CONNECTION_STRING`（不要提交这个文件）。

要在本地把 Neon 迁移应用到 `.dev.vars` 里那个库（不设 `GITHUB_REF`，脚本默认直接
应用；想只看会跑什么就加 `NEON_MIGRATE=check`）：

```bash
npm run migrate:neon
```
