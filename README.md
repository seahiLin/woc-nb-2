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
migrations/
  0001_create_employees.sql              # employees schema 在 D1 上的等价结构
  0002_employees_dashboard_snapshot.sql  # 看板快照表
  0003_align_employees_indexes.sql       # 去掉 0001 里凭空多出的索引，对齐 Neon
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

## 迁移与 Neon 的对应关系

`0001_create_employees.sql` 用 SQLite 语法重建了 Neon 上的结构：

| Neon (Postgres)                | D1 (SQLite)                        |
| ------------------------------ | ---------------------------------- |
| `bigint`                       | `INTEGER`                          |
| `varchar(n)`                   | `TEXT` + `CHECK (length(...) <= n)` |
| `char(4)`                      | `TEXT` + `CHECK`                   |
| `date`                         | `DATE`                             |
| `employees.employee_gender`    | `TEXT CHECK (gender IN ('M','F'))` |
| `nextval('employees.id_employee_seq')` | `INTEGER PRIMARY KEY`（自增语义） |

D1 的 `PRAGMA foreign_keys` 默认关闭，外键声明仅作结构留档；页面的数据不读 D1 的这六张表。

索引也按 Neon 的实际情况对齐，不多不少 9 个：

| 表 | 索引 | 类型 |
| --- | --- | --- |
| `employee` | `(id)` | PK |
| `department` | `(id)` · `(dept_name)` | PK · UNIQUE |
| `department_employee` | `(employee_id, department_id)` · `(department_id)` | PK · INDEX |
| `department_manager` | `(employee_id, department_id)` · `(department_id)` | PK · INDEX |
| `salary` | `(employee_id, from_date)` | PK |
| `title` | `(employee_id, title, from_date)` | PK |

Neon 里这些索引的物理名是 `idx_16979_primary` / `idx_16982_dept_no` 这类
（原始数据集导入时生成的），D1 侧用了可读名，列组合与唯一性一致。

## 本地开发

```bash
npm install
npm run dev
```

需要在 `.dev.vars` 里提供 `CONNECTION_STRING`（不要提交这个文件）。
