-- D1 上只该有一张表：看板快照。
--
-- 背景：0001 用 SQLite 语法在 D1 上重建了 Neon 的六张 `employees` 表，但页面
-- 从来没读过它们 —— 唯一数据源是 Neon，D1 只放一份聚合结果的 JSON 快照。
-- 那套结构现在归 `neon/migrations/`（Postgres 语法，由
-- `scripts/migrate-neon.mjs` 在部署前应用），D1 里再留一份影子结构只会让人
-- 以为数据在那边。
--
-- 所以这个文件做两件事：
--   1. 确保快照表存在（全新库里 0002 还没跑过也不会缺）；
--   2. 删掉那六张影子表。
--
-- 先删子表再删父表，即便开了 foreign_keys 也不会被挡住。

CREATE TABLE IF NOT EXISTS employees_dashboard_snapshot (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  payload    TEXT    NOT NULL,          -- 序列化后的 Dashboard JSON
  source     TEXT    NOT NULL,          -- 'neon:neondb/employees'
  synced_at  TEXT    NOT NULL,          -- ISO 时间戳
  row_count  INTEGER NOT NULL DEFAULT 0 -- 快照覆盖的员工数，便于观测
);

DROP TABLE IF EXISTS department_employee;
DROP TABLE IF EXISTS department_manager;
DROP TABLE IF EXISTS salary;
DROP TABLE IF EXISTS title;
DROP TABLE IF EXISTS employee;
DROP TABLE IF EXISTS department;
