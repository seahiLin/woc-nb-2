# woc-nb-2 · 员工数据看板

TanStack Start 应用，跑在 Cloudflare Workers 上。页面是一个 HR/BI 看板，数据实时来自
Neon Postgres 的 `employees` schema。

## 数据源

- **Neon**（唯一数据源）：库 `neondb`，schema `employees`，六张表 ——
  `employee` / `department` / `department_employee` / `department_manager` / `salary` / `title`。
  连接用官方驱动 `@neondatabase/serverless`，走真正的 Postgres 协议（WebSocket 上的
  `Pool` / `Client`，即 node-postgres 的 API，而非 HTTP 单次查询）。连接串来自 Worker
  secret `CONNECTION_STRING`，只在服务端读取，不会下发到浏览器。
- **D1**（`env.DB`，可选）：只存一份看板聚合结果的 JSON 快照。Neon 连不上时页面回退到
  这份快照，并把状态灯标成“缓存”，而不是直接白屏。

口径：`to_date = '9999-01-01'` 视为“当前有效”。

## 目录

```
migrations/
  0001_create_employees.sql              # employees schema 在 D1 上的等价结构
  0002_employees_dashboard_snapshot.sql  # 看板快照表
  0003_align_employees_indexes.sql       # 去掉 0001 里凭空多出的索引，对齐 Neon
src/lib/
  neon.server.ts            # Neon 驱动封装（Pool/Client，每个请求用完即关）
  employees.queries.server.ts # 看板用到的全部 SQL
  snapshot.server.ts        # D1 快照读写
  worker-env.server.ts      # 读取 Worker secret / D1 binding
  dashboard.functions.ts    # 服务端函数（页面唯一入口）
  dashboard-types.ts        # 前后端共享的数据结构
src/components/charts.tsx   # 手写 SVG 图表原语
src/routes/index.tsx        # 看板页面
```

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
