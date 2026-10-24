-- 看板快照（D1 侧）。
--
-- Neon 是唯一的数据源；这张表只做一件事：把最近一次成功拉取到的
-- 看板聚合结果（JSON）留在 D1 里。Neon 暂时连不上时，页面回退到这份
-- 快照并标注“缓存”，而不是直接白屏。
--
-- 每次实时拉取成功后会自动覆盖这一行（只有一行，id = 1）。

CREATE TABLE IF NOT EXISTS employees_dashboard_snapshot (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  payload    TEXT    NOT NULL,          -- 序列化后的 Dashboard JSON
  source     TEXT    NOT NULL,          -- 'neon:neondb/employees'
  synced_at  TEXT    NOT NULL,          -- ISO 时间戳
  row_count  INTEGER NOT NULL DEFAULT 0 -- 快照覆盖的员工数，便于观测
);
