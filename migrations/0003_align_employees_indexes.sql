-- 修正 0001 里多出来的索引。
--
-- 0001 是我按“看板将来可能查什么”补了几个索引，但那不是 Neon 里的定义。
-- 这个 schema 的定位是 **如实镜像** Neon 的 `employees` schema，所以把
-- 凭空加上的索引去掉，让两边能一一对上。
--
-- 对齐后 D1 侧只剩 Neon 里真实存在的 9 个索引：
--   employee            (id)                          PK
--   department          (id)                          PK
--                       (dept_name)                   UNIQUE   idx_16979_dept_name
--   department_employee (employee_id, department_id)  PK
--                       (department_id)                        idx_16982_dept_no
--   department_manager  (employee_id, department_id)  PK
--                       (department_id)                        idx_16985_dept_no
--   salary              (employee_id, from_date)      PK
--   title               (employee_id, title, from_date) PK
--
-- 注意：Neon 里 employee.id 由 `employees.id_employee_seq` 序列提供默认值
-- （nextval），D1 侧用 INTEGER PRIMARY KEY 等价表达，没有独立序列对象。

DROP INDEX IF EXISTS idx_employee_hire_date;
DROP INDEX IF EXISTS idx_employee_last_name;
DROP INDEX IF EXISTS idx_department_employee_to_date;
DROP INDEX IF EXISTS idx_department_manager_to_date;
DROP INDEX IF EXISTS idx_salary_to_date;
DROP INDEX IF EXISTS idx_salary_amount;
DROP INDEX IF EXISTS idx_title_to_date;
