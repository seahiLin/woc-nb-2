# 员工与薪酬 · 数据报告

一份关于员工数据集的**分析报告**，不是监控大屏：先给结论，再给图，最后能查单个员工。
跑在 Cloudflare Workers 上（TanStack Start），数据来自 Neon Postgres。

## 页面结构

按一篇数据故事来排：封面 → 导语 → 若干节 → 检索 → 统计口径。

```
封面      标题就是结论：一半的工资单落在 $X 到 $Y 之间；下面是整幅宽的直方图
导语      这份登记册记了多少年、记了些什么；后面几张图读的是同一批人
招聘      一条随滚动逐年填实的年份轴：招了多少，留下多少
巨号数字  只有一个：不在职的比例。它把“招进来”和“留下的”分成前后两半
部门      以全员平均为中轴的偏离条：谁给得多，一眼看出
职衔      同一职衔内部的最低—最高，红线是中位数
性别      各职衔内的同岗差，最后一行是全体，红线是“同酬”
最高薪    十个人各自的棒，红线是全体中位数
查一个人  按工号或姓名片段实时查
口径      六条定义，放在最后，用更小的字
```

页面上的文字只讲**数据本身**：多少人、多少钱、差多少。数据源、表名、连接方式这类
实现细节不出现在页面上。

克制是刻意的：一节只说一件事，标题本身就是结论，所以不再加栏目名、编号、图例和
“怎么读这张图”的说明；全站一个红，只做基准线；不画卡片底色，用留白和细线分区。
版面只有一条规矩：正文永远在窄栏里（一行三十字上下），图永远比正文宽。

## 技术栈

| 层 | 用什么 |
| --- | --- |
| 框架 | TanStack Start（文件路由，`src/routes/`）+ React 19 |
| 样式 | Tailwind CSS v4（`src/styles.css` 里的语义 token） |
| 图表 | 手写 SVG + CSS（`src/components/charts.tsx`），不引图表库 |
| 版式 | 文章的版式原语（`src/components/story.tsx`） |
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

执行器默认只在 **main** 上真正应用。原因不是分支拿不到连接串 —— 部署工作流把生产与
Preview 分成两个 job，各自加载自己的那份变量，两边是**不同**的 secret —— 而是无法从
仓库里确认 `TRIA_ENV_PREVIEW` 里的连接串指向哪个库。若它指向生产库，分支上跑迁移就会
改到生产 schema。非 main 只报告待应用的迁移（dry-run）；确认 Preview 指向独立的 Neon
分支后，可以用 `NEON_MIGRATE=apply` 或改 `shouldApply()` 放开。

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
src/components/charts.tsx     # 手写 SVG / CSS 图表 + 格式化
src/components/story.tsx      # 文章版式原语（正文栏、章节、图注、巨号数字、口径）
src/routes/index.tsx          # 报告页面
drizzle/                      # drizzle-kit 生成的迁移与快照
migrations/                   # D1 迁移
scripts/migrate.mjs           # Neon 迁移执行器（部署前跑）
```

## 设计

取向：**一份冻结在 2002 年 8 月的薪资登记册**，按一篇数据故事来排。题材是工资单，
所以用的是台账的语言：连续打印纸的底色、衬线字、等宽数字、细线分行。

- **纸是偏冷的浅绿灰**（`#F0F2ED`），连续打印纸那种绿，不是暖米色。
- **只有一个红**（`#9E2418`），只做「基准线」：分布图里的中位数、部门图里的
  全员平均、性别图里的「同酬」。红在哪里出现，哪里就是比较的基准，没有装饰性用法。
- **全站衬线**（Newsreader，汉字回退到宋体），数字和正文同一种语气；只有
  极小的轴标和注脚换成无衬线。全站不用等宽字体。
- **宽与窄的对比就是全部版式**：正文窄栏三十字上下，图永远比正文宽；
  不用卡片、底色或装饰性分隔线。
- **标题就是结论**：每节一条，不加栏目名、编号、小标签。
- **全篇两个动效**：首屏直方图从基线「打」出来一次；招聘年份轴随滚动逐年填实，
  读数跟着走到当前这一年。其余元素都不动，`prefers-reduced-motion` 下两个都关掉。
- **巨号数字只用一次**（不在职的比例），它是节拍，不是装饰。
- 数字统一 `font-variant-numeric: tabular-nums`，表格和正文里的数才能对齐。
- 图表不引第三方库：数据量小、形状固定，手写更可控也不给客户端加体积。
