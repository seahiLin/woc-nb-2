-- employees schema —— Neon Postgres 侧的权威定义（唯一数据源的结构）。
--
-- 由 `scripts/migrate-neon.mjs` 在每次部署前按文件名顺序应用到
-- `CONNECTION_STRING` 指向的数据库；已应用过的文件记录在
-- `public.schema_migrations` 里，不会重复执行。
--
-- 六张表：
--   employee            员工主表
--   department          部门（9 个）
--   department_employee 员工-部门任职区间
--   department_manager  部门-经理任职区间
--   salary              薪资历史（按员工 + 生效日）
--   title               职衔历史（按员工 + 职衔 + 生效日）
--
-- 区间约定沿用原始数据：`to_date = '9999-01-01'` 表示“当前仍然有效”。
--
-- 这份 DDL 与原数据集导入后的实际结构逐项对齐（列类型、varchar 长度、
-- 主键/外键名、索引名都一样），所以对已经存在这份数据的库来说它整体是
-- no-op；对一个空库来说，跑完得到的是同一套结构。

create schema if not exists employees;

-- employee.id 的默认值来自这个独立序列（原数据集就是这么建的）。
create sequence if not exists employees.id_employee_seq;

-- 原数据集的 employees.employee_gender 枚举（M / F）。
-- Postgres 没有 `create type if not exists`，用 DO 块补一个存在性判断。
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'employees' and t.typname = 'employee_gender'
  ) then
    create type employees.employee_gender as enum ('M', 'F');
  end if;
end
$$;

-- 员工 ---------------------------------------------------------------
create table if not exists employees.employee (
  id         bigint not null default nextval('employees.id_employee_seq'),
  birth_date date not null,
  first_name varchar(14) not null,
  last_name  varchar(16) not null,
  gender     employees.employee_gender not null,
  hire_date  date not null,
  constraint idx_16988_primary primary key (id)
);

alter sequence employees.id_employee_seq owned by employees.employee.id;

-- 部门 ---------------------------------------------------------------
create table if not exists employees.department (
  id        char(4) not null,
  dept_name varchar(40) not null,
  constraint idx_16979_primary primary key (id)
);

create unique index if not exists idx_16979_dept_name on employees.department (dept_name);

-- 员工-部门 ----------------------------------------------------------
create table if not exists employees.department_employee (
  employee_id   bigint not null,
  department_id char(4) not null,
  from_date     date not null,
  to_date       date not null,
  constraint idx_16982_primary primary key (employee_id, department_id),
  constraint dept_emp_ibfk_1 foreign key (employee_id)
    references employees.employee (id) on update restrict on delete cascade,
  constraint dept_emp_ibfk_2 foreign key (department_id)
    references employees.department (id) on update restrict on delete cascade
);

create index if not exists idx_16982_dept_no on employees.department_employee (department_id);

-- 部门-经理 ----------------------------------------------------------
create table if not exists employees.department_manager (
  employee_id   bigint not null,
  department_id char(4) not null,
  from_date     date not null,
  to_date       date not null,
  constraint idx_16985_primary primary key (employee_id, department_id),
  constraint dept_manager_ibfk_1 foreign key (employee_id)
    references employees.employee (id) on update restrict on delete cascade,
  constraint dept_manager_ibfk_2 foreign key (department_id)
    references employees.department (id) on update restrict on delete cascade
);

create index if not exists idx_16985_dept_no on employees.department_manager (department_id);

-- 薪资历史 -----------------------------------------------------------
create table if not exists employees.salary (
  employee_id bigint not null,
  amount      bigint not null,
  from_date   date not null,
  to_date     date not null,
  constraint idx_16991_primary primary key (employee_id, from_date),
  constraint salaries_ibfk_1 foreign key (employee_id)
    references employees.employee (id) on update restrict on delete cascade
);

-- 职衔历史 -----------------------------------------------------------
-- `to_date` 是这套结构里唯一可空的列。
create table if not exists employees.title (
  employee_id bigint not null,
  title       varchar(50) not null,
  from_date   date not null,
  to_date     date,
  constraint idx_16994_primary primary key (employee_id, title, from_date),
  constraint titles_ibfk_1 foreign key (employee_id)
    references employees.employee (id) on update restrict on delete cascade
);
