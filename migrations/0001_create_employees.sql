-- employees —— 员工数据集（源自 Neon 库 `neondb` 的 `employees` schema）。
--
-- ⚠️ 已废弃：`employees` 的权威定义在 `neon/migrations/0001_employees_schema.sql`
-- （Postgres 语法，由 `scripts/migrate-neon.mjs` 在部署前应用）。这里只是当年用
-- SQLite 语法做的一份结构镜像，页面从来不读它；`0004_snapshot_only.sql` 会删掉
-- 这几张表。文件留着是为了迁就已部署 D1 库的迁移历史，不要再往这里加东西。
--
-- 结构说明：
--   * employee            员工主表
--   * department          部门（9 个）
--   * department_employee 员工-部门任职区间
--   * department_manager  部门-经理任职区间
--   * salary              薪资历史（按员工 + 生效日）
--   * title               职衔历史（按员工 + 职衔 + 生效日）
--
-- 区间约定沿用原始数据：`to_date = '9999-01-01'` 表示“当前仍然有效”。
-- 这里用 SQLite / D1 语法重建，字段名、类型语义、主键与索引都对齐
-- Neon 中的定义：
--   bigint          → INTEGER
--   varchar(n)      → TEXT（长度上限用 CHECK 保留）
--   char(4)         → TEXT
--   date            → DATE（SQLite 里是 TEXT 的别名）
--   employees.employee_gender ENUM('M','F') → TEXT + CHECK
--
-- 注意：D1 的 `PRAGMA foreign_keys` 默认关闭，外键声明用于结构留档。

-- 员工 ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee (
  id         INTEGER PRIMARY KEY,          -- 原 nextval('employees.id_employee_seq')
  birth_date DATE    NOT NULL,
  first_name TEXT    NOT NULL,             -- varchar(14)
  last_name  TEXT    NOT NULL,             -- varchar(16)
  gender     TEXT    NOT NULL CHECK (gender IN ('M', 'F')),  -- 原 employee_gender ENUM
  hire_date  DATE    NOT NULL,
  CONSTRAINT employee_first_name_len CHECK (length(first_name) <= 14),
  CONSTRAINT employee_last_name_len  CHECK (length(last_name)  <= 16)
);

CREATE INDEX IF NOT EXISTS idx_employee_hire_date ON employee (hire_date);
CREATE INDEX IF NOT EXISTS idx_employee_last_name ON employee (last_name);

-- 部门 ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS department (
  id        TEXT PRIMARY KEY,              -- char(4)，例如 'd001'
  dept_name TEXT NOT NULL,                 -- varchar(40)，原始库中唯一
  CONSTRAINT department_id_len        CHECK (length(id) <= 4),
  CONSTRAINT department_dept_name_len CHECK (length(dept_name) <= 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_department_dept_name ON department (dept_name);

-- 员工-部门 ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS department_employee (
  employee_id   INTEGER NOT NULL REFERENCES employee (id)   ON DELETE CASCADE,
  department_id TEXT    NOT NULL REFERENCES department (id) ON DELETE CASCADE,
  from_date     DATE    NOT NULL,
  to_date       DATE    NOT NULL,
  PRIMARY KEY (employee_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_department_employee_department ON department_employee (department_id);
CREATE INDEX IF NOT EXISTS idx_department_employee_to_date    ON department_employee (to_date);

-- 部门-经理 ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS department_manager (
  employee_id   INTEGER NOT NULL REFERENCES employee (id)   ON DELETE CASCADE,
  department_id TEXT    NOT NULL REFERENCES department (id) ON DELETE CASCADE,
  from_date     DATE    NOT NULL,
  to_date       DATE    NOT NULL,
  PRIMARY KEY (employee_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_department_manager_department ON department_manager (department_id);
CREATE INDEX IF NOT EXISTS idx_department_manager_to_date    ON department_manager (to_date);

-- 薪资历史 -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS salary (
  employee_id INTEGER NOT NULL REFERENCES employee (id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,            -- 原始为 bigint
  from_date   DATE    NOT NULL,
  to_date     DATE    NOT NULL,
  PRIMARY KEY (employee_id, from_date)
);

CREATE INDEX IF NOT EXISTS idx_salary_to_date ON salary (to_date);
CREATE INDEX IF NOT EXISTS idx_salary_amount  ON salary (amount);

-- 职衔历史 -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS title (
  employee_id INTEGER NOT NULL REFERENCES employee (id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,            -- varchar(50)
  from_date   DATE    NOT NULL,
  to_date     DATE,                        -- 原始定义中唯一可空的列
  PRIMARY KEY (employee_id, title, from_date),
  CONSTRAINT title_title_len CHECK (length(title) <= 50)
);

CREATE INDEX IF NOT EXISTS idx_title_to_date ON title (to_date);
