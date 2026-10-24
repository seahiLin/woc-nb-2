/**
 * BI 看板的所有 SQL 都集中在这里（服务端专用）。
 *
 * 全部针对 Neon 上 `employees` schema 的六张表：
 *   employee / department / department_employee / department_manager / salary / title
 *
 * 口径统一：`to_date = '9999-01-01'` 视为“当前有效”。
 * 这些语句在 Neon 上跑过（单批约 1s 内），所以一次只读事务就够了。
 */

import { databaseName, query, readOnlyBatch } from './neon.server'
import type {
  Dashboard,
  DepartmentStat,
  EmployeeRow,
  GenderStat,
  HireYear,
  Kpis,
  SalaryBand,
  SalaryTrendPoint,
  TitleStat,
  TopEarner,
} from './dashboard-types'

const CURRENT = `'9999-01-01'`

const KPI_QUERY = `
  select
    (select count(*) from employees.employee)::int                          as headcount,
    (select count(*) from employees.department)::int                        as departments,
    (select count(*) from employees.title where to_date = ${CURRENT})::int   as active_headcount,
    (select count(*) from employees.salary where to_date = ${CURRENT})::int  as current_salaries,
    (select round(avg(amount)) from employees.salary where to_date = ${CURRENT})::int as avg_salary,
    (select round(percentile_cont(0.5) within group (order by amount))
       from employees.salary where to_date = ${CURRENT})::int               as median_salary,
    (select max(amount) from employees.salary where to_date = ${CURRENT})::int as max_salary,
    (select min(amount) from employees.salary where to_date = ${CURRENT})::int as min_salary,
    (select count(*) from employees.salary)::int                            as salary_records,
    (select count(*) from employees.title)::int                             as title_records,
    (select count(*) from employees.department_employee)::int               as assignment_records,
    (select count(*) from employees.department_manager)::int                as manager_records,
    (select min(hire_date)::text from employees.employee)                   as first_hire,
    (select max(hire_date)::text from employees.employee)                   as last_hire,
    current_database()                                                      as database_name
`

const BANDS_QUERY = `
  select
    (30000 + 10000 * (width_bucket(amount, 30000, 160001, 13) - 1))::int as band,
    count(*)::int as n
  from employees.salary
  where to_date = ${CURRENT}
  group by 1
  order by 1
`

const DEPARTMENTS_QUERY = `
  select
    d.id,
    d.dept_name as name,
    m.first_name || ' ' || m.last_name as manager,
    count(de.employee_id)::int as headcount,
    round(avg(s.amount))::int as avg_salary,
    max(s.amount)::int as max_salary
  from employees.department d
  left join employees.department_employee de
    on de.department_id = d.id and de.to_date = ${CURRENT}
  left join employees.salary s
    on s.employee_id = de.employee_id and s.to_date = ${CURRENT}
  left join employees.department_manager dm
    on dm.department_id = d.id and dm.to_date = ${CURRENT}
  left join employees.employee m on m.id = dm.employee_id
  group by d.id, d.dept_name, m.first_name, m.last_name
  order by headcount desc
`

const TITLES_QUERY = `
  select
    t.title,
    count(*)::int as headcount,
    round(avg(s.amount))::int as avg_salary
  from employees.title t
  left join employees.salary s
    on s.employee_id = t.employee_id and s.to_date = ${CURRENT}
  where t.to_date = ${CURRENT}
  group by t.title
  order by headcount desc
`

const HIRES_QUERY = `
  select extract(year from hire_date)::int as year, count(*)::int as n
  from employees.employee
  group by 1
  order by 1
`

const GENDER_QUERY = `
  select e.gender, count(*)::int as headcount, round(avg(s.amount))::int as avg_salary
  from employees.salary s
  join employees.employee e on e.id = s.employee_id
  where s.to_date = ${CURRENT}
  group by e.gender
  order by e.gender
`

const TOP_EARNERS_QUERY = `
  select
    e.id::text as id,
    e.first_name || ' ' || e.last_name as name,
    t.title,
    d.dept_name as department,
    s.amount::int as salary,
    e.hire_date::text as hire_date
  from employees.salary s
  join employees.employee e on e.id = s.employee_id
  left join lateral (
    select ti.title from employees.title ti
    where ti.employee_id = e.id and ti.to_date = ${CURRENT}
    limit 1
  ) t on true
  left join lateral (
    select dp.dept_name from employees.department_employee de
    join employees.department dp on dp.id = de.department_id
    where de.employee_id = e.id and de.to_date = ${CURRENT}
    limit 1
  ) d on true
  where s.to_date = ${CURRENT}
  order by s.amount desc
  limit 8
`

const TREND_QUERY = `
  select
    extract(year from from_date)::int as year,
    round(avg(amount))::int as avg_salary,
    count(*)::int as n
  from employees.salary
  group by 1
  order by 1
`

export const EMPLOYEE_SEARCH_SQL = `
  select
    e.id::text as id,
    e.first_name || ' ' || e.last_name as name,
    e.gender,
    t.title,
    d.dept_name as department,
    s.amount::int as salary,
    e.hire_date::text as hire_date
  from employees.employee e
  left join lateral (
    select ti.title from employees.title ti
    where ti.employee_id = e.id and ti.to_date = ${CURRENT}
    limit 1
  ) t on true
  left join lateral (
    select dp.dept_name from employees.department_employee de
    join employees.department dp on dp.id = de.department_id
    where de.employee_id = e.id and de.to_date = ${CURRENT}
    limit 1
  ) d on true
  left join lateral (
    select sa.amount from employees.salary sa
    where sa.employee_id = e.id and sa.to_date = ${CURRENT}
    limit 1
  ) s on true
  where e.id::text = $1 or e.first_name ilike $2 or e.last_name ilike $2
  order by e.id
  limit 25
`

interface KpiRow {
  headcount: number
  departments: number
  active_headcount: number
  current_salaries: number
  avg_salary: number
  median_salary: number
  max_salary: number
  min_salary: number
  salary_records: number
  title_records: number
  assignment_records: number
  manager_records: number
  first_hire: string
  last_hire: string
  database_name: string
}

interface BandRow {
  band: number
  n: number
}

interface DepartmentRow {
  id: string
  name: string
  manager: string | null
  headcount: number
  avg_salary: number
  max_salary: number
}

interface TitleRow {
  title: string
  headcount: number
  avg_salary: number
}

interface HireRow {
  year: number
  n: number
}

interface GenderRow {
  gender: 'M' | 'F'
  headcount: number
  avg_salary: number
}

interface TopEarnerRow {
  id: string
  name: string
  title: string | null
  department: string | null
  salary: number
  hire_date: string
}

interface TrendRow {
  year: number
  avg_salary: number
  n: number
}

const num = (value: unknown): number => {
  // pg 把 `count(*)`（int8）和 `numeric` 解成字符串，避免大数丢精度；
  // 看板这里的量级远低于 2^53，直接转 number 即可。
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const str = (value: unknown): string => (value === null || value === undefined ? '' : String(value))

/**
 * 一次只读事务，把看板需要的所有切片都取回来。
 * 所有语句同一口径，走同一条连接。
 */
export async function loadDashboard(connectionString: string): Promise<Dashboard> {
  const [kpis, bands, departments, titles, hires, gender, topEarners, trend] =
    (await readOnlyBatch(connectionString, [
      KPI_QUERY,
      BANDS_QUERY,
      DEPARTMENTS_QUERY,
      TITLES_QUERY,
      HIRES_QUERY,
      GENDER_QUERY,
      TOP_EARNERS_QUERY,
      TREND_QUERY,
    ])) as unknown as [
      KpiRow[],
      BandRow[],
      DepartmentRow[],
      TitleRow[],
      HireRow[],
      GenderRow[],
      TopEarnerRow[],
      TrendRow[],
    ]

  const kpiRow = kpis[0]
  if (!kpiRow) throw new Error('Neon 没有返回 KPI 行')

  const kpi: Kpis = {
    headcount: num(kpiRow.headcount),
    departments: num(kpiRow.departments),
    activeHeadcount: num(kpiRow.active_headcount),
    currentSalaries: num(kpiRow.current_salaries),
    avgSalary: num(kpiRow.avg_salary),
    medianSalary: num(kpiRow.median_salary),
    maxSalary: num(kpiRow.max_salary),
    minSalary: num(kpiRow.min_salary),
    salaryRecords: num(kpiRow.salary_records),
    titleRecords: num(kpiRow.title_records),
    assignmentRecords: num(kpiRow.assignment_records),
    managerRecords: num(kpiRow.manager_records),
    firstHire: str(kpiRow.first_hire),
    lastHire: str(kpiRow.last_hire),
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'neon',
    database: str(kpiRow.database_name) || databaseName(connectionString),
    kpis: kpi,
    bands: bands.map<SalaryBand>((row) => ({ band: num(row.band), count: num(row.n) })),
    departments: departments.map<DepartmentStat>((row) => ({
      id: str(row.id),
      name: str(row.name),
      manager: row.manager ? str(row.manager) : null,
      headcount: num(row.headcount),
      avgSalary: num(row.avg_salary),
      maxSalary: num(row.max_salary),
    })),
    titles: titles.map<TitleStat>((row) => ({
      title: str(row.title),
      headcount: num(row.headcount),
      avgSalary: num(row.avg_salary),
    })),
    hires: hires.map<HireYear>((row) => ({ year: num(row.year), count: num(row.n) })),
    gender: gender.map<GenderStat>((row) => ({
      gender: row.gender === 'F' ? 'F' : 'M',
      headcount: num(row.headcount),
      avgSalary: num(row.avg_salary),
    })),
    topEarners: topEarners.map<TopEarner>((row) => ({
      id: str(row.id),
      name: str(row.name),
      title: row.title ? str(row.title) : null,
      department: row.department ? str(row.department) : null,
      salary: num(row.salary),
      hireDate: str(row.hire_date),
    })),
    salaryTrend: trend.map<SalaryTrendPoint>((row) => ({
      year: num(row.year),
      avgSalary: num(row.avg_salary),
      records: num(row.n),
    })),
  }
}

export async function searchEmployees(
  connectionString: string,
  term: string,
): Promise<EmployeeRow[]> {
  const trimmed = term.trim()
  const rows = await query<{
    id: string
    name: string
    gender: 'M' | 'F'
    title: string | null
    department: string | null
    salary: number | null
    hire_date: string
  }>(connectionString, EMPLOYEE_SEARCH_SQL, [trimmed, `%${trimmed}%`])

  return rows.map<EmployeeRow>((row) => ({
    id: str(row.id),
    name: str(row.name),
    gender: row.gender === 'F' ? 'F' : 'M',
    title: row.title ? str(row.title) : null,
    department: row.department ? str(row.department) : null,
    salary: row.salary === null || row.salary === undefined ? null : num(row.salary),
    hireDate: str(row.hire_date),
  }))
}
