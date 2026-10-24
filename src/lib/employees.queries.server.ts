/**
 * 看板的所有 SQL（服务端专用）。
 *
 * 全部针对 Neon 上 `employees` schema 的六张表：
 *   employee / department / department_employee / department_manager / salary / title
 *
 * 口径：
 *   * `to_date = '9999-01-01'` 表示“当前有效”。
 *   * 数据集的时间基准取薪资历史里最后一个真实结束日（约 2002-08-01），
 *     不写死 —— 换一份数据集也能自动对上。
 *   * 同一个员工在同一时点只有一条当前职衔、一条当前部门任职、一条当前薪资，
 *     所以这些 join 不会放大行数。
 */

import { databaseName, query, readOnlyBatch } from './neon.server'
import type {
  Dashboard,
  DepartmentStat,
  EmployeeRow,
  GenderGroup,
  RetentionYear,
  SalaryBucket,
  TitleStat,
  TopEarner,
  TrendPoint,
} from './dashboard-types'

const CURRENT = `'9999-01-01'`

/**
 * 汇总 + 基准日。
 *
 * `as_of` 取薪资历史里最后一个真实结束日的次日（本数据集是 2002-08-02），
 * 不写死，换一份数据集也能自动对上。司龄也是相对这一天算的。
 */
const TOTALS_QUERY = `
  with cur_salary as (
    select employee_id, amount from employees.salary where to_date = ${CURRENT}
  ),
  cur_dept as (
    select employee_id, department_id from employees.department_employee where to_date = ${CURRENT}
  ),
  as_of as (
    select (max(to_date) + 1)::date as d from employees.salary where to_date <> ${CURRENT}
  )
  select
    (select count(*) from employees.employee)::int                        as employees,
    (select count(*) from cur_dept)::int                                  as active_employees,
    (select count(*) from employees.department)::int                      as departments,
    (select count(*) from employees.salary)::int                          as salary_records,
    (select count(*) from employees.title)::int                           as title_records,
    (select count(*) from employees.department_employee)::int             as assignment_records,
    (select count(*) from employees.department_manager)::int              as manager_records,
    (select round(avg(amount)) from cur_salary)::int                      as avg_salary,
    (select round(percentile_cont(0.5) within group (order by amount)) from cur_salary)::int as median_salary,
    (select round(percentile_cont(0.25) within group (order by amount)) from cur_salary)::int as p25_salary,
    (select round(percentile_cont(0.75) within group (order by amount)) from cur_salary)::int as p75_salary,
    (select min(amount) from cur_salary)::int                             as min_salary,
    (select max(amount) from cur_salary)::int                             as max_salary,
    (select min(hire_date)::text from employees.employee)                 as first_hire,
    (select max(hire_date)::text from employees.employee)                 as last_hire,
    (select round(avg((a.d - e.hire_date) / 365.25))
       from employees.employee e
       join cur_dept cd on cd.employee_id = e.id
       cross join as_of a)::int                                           as avg_tenure_years,
    (select d::text from as_of)                                           as as_of,
    current_database()                                                    as database_name
`

/**
 * 薪资分布：$40K 起、每 $5K 一档，最后一档兜住所有 $120K 以上。
 * 用手写区间而不是 width_bucket，是为了让横轴标签是整数好读。
 */
const DISTRIBUTION_QUERY = `
  with binned as (
    select case
             when amount >= 120000 then 120000
             else (floor(amount / 5000.0) * 5000)::int
           end as bucket_from
    from employees.salary
    where to_date = ${CURRENT}
  )
  select bucket_from::int as from_usd, count(*)::int as n
  from binned
  group by 1
  order by 1
`

/**
 * 招聘与留存：每年招了多少人，其中多少人到今天还在职。
 * 这是整个数据集最有信息量的一张图 —— 招得越晚，留下的越少。
 */
const RETENTION_QUERY = `
  with cur_dept as (
    select employee_id from employees.department_employee where to_date = ${CURRENT}
  )
  select
    extract(year from e.hire_date)::int as year,
    count(*)::int as hired,
    count(d.employee_id)::int as active
  from employees.employee e
  left join cur_dept d on d.employee_id = e.id
  group by 1
  order by 1
`

const DEPARTMENTS_QUERY = `
  with cur_dept as (
    select employee_id, department_id from employees.department_employee where to_date = ${CURRENT}
  ),
  cur_salary as (
    select employee_id, amount from employees.salary where to_date = ${CURRENT}
  ),
  cur_mgr as (
    select dm.department_id, dm.employee_id, dm.from_date
    from employees.department_manager dm
    where dm.to_date = ${CURRENT}
  ),
  dept_stats as (
    select
      d.id,
      d.dept_name as name,
      count(cd.employee_id)::int as headcount,
      round(avg(s.amount))::int as avg_salary,
      round(percentile_cont(0.5) within group (order by s.amount))::int as median_salary,
      min(s.amount)::int as min_salary,
      max(s.amount)::int as max_salary,
      (count(*) filter (where e.gender = 'F'))::numeric
        / nullif(count(cd.employee_id), 0) as female_share
    from employees.department d
    left join cur_dept cd on cd.department_id = d.id
    left join employees.employee e on e.id = cd.employee_id
    left join cur_salary s on s.employee_id = cd.employee_id
    group by d.id, d.dept_name
  ),
  dept_mgr as (
    select
      m.department_id,
      e.first_name || ' ' || e.last_name as name,
      m.from_date::text as since,
      s.amount::int as salary
    from cur_mgr m
    join employees.employee e on e.id = m.employee_id
    left join cur_salary s on s.employee_id = m.employee_id
  )
  select
    st.id, st.name, st.headcount, st.avg_salary, st.median_salary,
    st.min_salary, st.max_salary, round(st.female_share, 3) as female_share,
    mg.name as manager_name, mg.since as manager_since, mg.salary as manager_salary,
    (select count(*) from cur_dept)::int as active_total
  from dept_stats st
  left join dept_mgr mg on mg.department_id = st.id
  order by st.headcount desc
`

const TITLES_QUERY = `
  with cur_salary as (
    select employee_id, amount from employees.salary where to_date = ${CURRENT}
  )
  select
    t.title,
    count(*)::int as headcount,
    round(avg(s.amount))::int as avg_salary,
    round(percentile_cont(0.5) within group (order by s.amount))::int as median_salary,
    min(s.amount)::int as min_salary,
    max(s.amount)::int as max_salary,
    (count(*) filter (where e.gender = 'F'))::numeric / nullif(count(*), 0) as female_share,
    round(avg(s.amount) filter (where e.gender = 'M'))::int as male_avg,
    round(avg(s.amount) filter (where e.gender = 'F'))::int as female_avg
  from employees.title t
  join cur_salary s on s.employee_id = t.employee_id
  join employees.employee e on e.id = t.employee_id
  where t.to_date = ${CURRENT}
  group by t.title
  order by headcount desc
`

const GENDER_QUERY = `
  with cur_salary as (
    select employee_id, amount from employees.salary where to_date = ${CURRENT}
  )
  select
    e.gender,
    count(*)::int as headcount,
    round(avg(s.amount))::int as avg_salary,
    round(percentile_cont(0.5) within group (order by s.amount))::int as median_salary
  from cur_salary s
  join employees.employee e on e.id = s.employee_id
  group by e.gender
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

const TOP_EARNERS_QUERY = `
  with cur_salary as (
    select employee_id, amount from employees.salary where to_date = ${CURRENT}
  )
  select
    e.id::text as id,
    e.first_name || ' ' || e.last_name as name,
    t.title,
    d.dept_name as department,
    s.amount::int as salary,
    e.hire_date::text as hire_date
  from cur_salary s
  join employees.employee e on e.id = s.employee_id
  left join employees.title t on t.employee_id = e.id and t.to_date = ${CURRENT}
  left join employees.department_employee de on de.employee_id = e.id and de.to_date = ${CURRENT}
  left join employees.department d on d.id = de.department_id
  order by s.amount desc
  limit 10
`

/**
 * 员工检索。`$1` 是精确工号，`$2` 是姓名模糊匹配。
 * 先把候选集缩到 26 条（多取一条用于判断是否截断），再回表取当前职衔/部门/薪资。
 */
export const EMPLOYEE_SEARCH_SQL = `
  with hits as (
    select e.id, e.first_name, e.last_name, e.gender, e.hire_date
    from employees.employee e
    where e.id::text = $1
       or e.first_name ilike $2
       or e.last_name ilike $2
    order by e.id
    limit 26
  )
  select
    h.id::text as id,
    h.first_name || ' ' || h.last_name as name,
    h.gender,
    t.title,
    d.dept_name as department,
    s.amount::int as salary,
    h.hire_date::text as hire_date
  from hits h
  left join employees.title t on t.employee_id = h.id and t.to_date = ${CURRENT}
  left join employees.department_employee de on de.employee_id = h.id and de.to_date = ${CURRENT}
  left join employees.department d on d.id = de.department_id
  left join employees.salary s on s.employee_id = h.id and s.to_date = ${CURRENT}
  order by h.id
`

/* ------------------------------------------------------------------ */
/* 行类型                                                              */
/* ------------------------------------------------------------------ */

interface TotalsRow {
  employees: number
  active_employees: number
  departments: number
  salary_records: number
  title_records: number
  assignment_records: number
  manager_records: number
  avg_salary: number
  median_salary: number
  p25_salary: number
  p75_salary: number
  min_salary: number
  max_salary: number
  first_hire: string
  last_hire: string
  avg_tenure_years: number
  as_of: string
  database_name: string
}

interface DistributionRow {
  from_usd: number
  n: number
}

interface RetentionRow {
  year: number
  hired: number
  active: number
}

interface DepartmentRow {
  id: string
  name: string
  headcount: number
  avg_salary: number
  median_salary: number
  min_salary: number
  max_salary: number
  female_share: number | null
  manager_name: string | null
  manager_since: string | null
  manager_salary: number | null
  active_total: number
}

interface TitleRow {
  title: string
  headcount: number
  avg_salary: number
  median_salary: number
  min_salary: number
  max_salary: number
  female_share: number | null
  male_avg: number | null
  female_avg: number | null
}

interface GenderRow {
  gender: 'M' | 'F'
  headcount: number
  avg_salary: number
  median_salary: number
}

interface TrendRow {
  year: number
  avg_salary: number
  n: number
}

interface TopEarnerRow {
  id: string
  name: string
  title: string | null
  department: string | null
  salary: number
  hire_date: string
}

const num = (value: unknown): number => {
  // pg 把 `count(*)`（int8）和 `numeric` 解成字符串，避免大数丢精度；
  // 看板这里的量级远低于 2^53，直接转 number 即可。
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const str = (value: unknown): string => (value === null || value === undefined ? '' : String(value))

/** pg 的 numeric 到 0–1 比例，null 归零。 */
const ratio = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0
}

const group = (row: GenderRow | undefined): GenderGroup => ({
  headcount: num(row?.headcount),
  avgSalary: num(row?.avg_salary),
  medianSalary: num(row?.median_salary),
})

/** 把稀疏的分档结果补齐成连续区间，图表才不会缺柱子。 */
function fillBuckets(rows: DistributionRow[]): SalaryBucket[] {
  if (rows.length === 0) return []
  const counts = new Map<number, number>()
  for (const row of rows) counts.set(num(row.from_usd), num(row.n))

  const min = Math.min(...counts.keys())
  const max = Math.max(...counts.keys())
  const buckets: SalaryBucket[] = []
  for (let from = min; from <= max; from += 5000) {
    buckets.push({ from, to: from + 5000, count: counts.get(from) ?? 0 })
  }
  return buckets
}

/* ------------------------------------------------------------------ */
/* 组装                                                                */
/* ------------------------------------------------------------------ */

/**
 * 一次只读事务，把看板需要的所有切片都取回来。
 * 所有语句同一口径，走同一条连接。
 */
export async function loadDashboard(connectionString: string): Promise<Dashboard> {
  const [totalsRows, distributionRows, retentionRows, departmentRows, titleRows, genderRows, trendRows, topEarnerRows] =
    (await readOnlyBatch(connectionString, [
      TOTALS_QUERY,
      DISTRIBUTION_QUERY,
      RETENTION_QUERY,
      DEPARTMENTS_QUERY,
      TITLES_QUERY,
      GENDER_QUERY,
      TREND_QUERY,
      TOP_EARNERS_QUERY,
    ])) as unknown as [
      TotalsRow[],
      DistributionRow[],
      RetentionRow[],
      DepartmentRow[],
      TitleRow[],
      GenderRow[],
      TrendRow[],
      TopEarnerRow[],
    ]

  const totalsRow = totalsRows[0]
  if (!totalsRow) throw new Error('Neon 没有返回汇总行')

  const asOf = str(totalsRow.as_of).slice(0, 10)
  const activeTotal = num(departmentRows[0]?.active_total)
  const male = group(genderRows.find((row) => row.gender === 'M'))
  const female = group(genderRows.find((row) => row.gender === 'F'))

  return {
    generatedAt: new Date().toISOString(),
    source: 'neon',
    database: str(totalsRow.database_name) || databaseName(connectionString),
    asOf,
    totals: {
      employees: num(totalsRow.employees),
      activeEmployees: num(totalsRow.active_employees),
      departments: num(totalsRow.departments),
      salaryRecords: num(totalsRow.salary_records),
      titleRecords: num(totalsRow.title_records),
      assignmentRecords: num(totalsRow.assignment_records),
      managerRecords: num(totalsRow.manager_records),
      avgSalary: num(totalsRow.avg_salary),
      medianSalary: num(totalsRow.median_salary),
      p25Salary: num(totalsRow.p25_salary),
      p75Salary: num(totalsRow.p75_salary),
      minSalary: num(totalsRow.min_salary),
      maxSalary: num(totalsRow.max_salary),
      firstHire: str(totalsRow.first_hire),
      lastHire: str(totalsRow.last_hire),
      avgTenureYears: num(totalsRow.avg_tenure_years),
    },
    distribution: {
      buckets: fillBuckets(distributionRows),
      median: num(totalsRow.median_salary),
      mean: num(totalsRow.avg_salary),
    },
    retention: retentionRows.map<RetentionYear>((row) => ({
      year: num(row.year),
      hired: num(row.hired),
      active: num(row.active),
    })),
    departments: departmentRows.map<DepartmentStat>((row) => ({
      id: str(row.id),
      name: str(row.name),
      headcount: num(row.headcount),
      share: activeTotal > 0 ? num(row.headcount) / activeTotal : 0,
      avgSalary: num(row.avg_salary),
      medianSalary: num(row.median_salary),
      minSalary: num(row.min_salary),
      maxSalary: num(row.max_salary),
      femaleShare: ratio(row.female_share),
      manager: row.manager_name
        ? {
            name: str(row.manager_name),
            since: str(row.manager_since).slice(0, 10),
            salary: num(row.manager_salary),
          }
        : null,
    })),
    titles: titleRows.map<TitleStat>((row) => ({
      title: str(row.title),
      headcount: num(row.headcount),
      avgSalary: num(row.avg_salary),
      medianSalary: num(row.median_salary),
      minSalary: num(row.min_salary),
      maxSalary: num(row.max_salary),
      femaleShare: ratio(row.female_share),
      maleAvg: num(row.male_avg),
      femaleAvg: num(row.female_avg),
    })),
    gender: { male, female },
    salaryTrend: trendRows.map<TrendPoint>((row) => ({
      year: num(row.year),
      avgSalary: num(row.avg_salary),
      records: num(row.n),
    })),
    topEarners: topEarnerRows.map<TopEarner>((row) => ({
      id: str(row.id),
      name: str(row.name),
      title: row.title ? str(row.title) : null,
      department: row.department ? str(row.department) : null,
      salary: num(row.salary),
      hireDate: str(row.hire_date).slice(0, 10),
    })),
  }
}

export async function searchEmployees(
  connectionString: string,
  term: string,
): Promise<{ rows: EmployeeRow[]; truncated: boolean }> {
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

  const truncated = rows.length > 25
  return {
    truncated,
    rows: rows.slice(0, 25).map<EmployeeRow>((row) => ({
      id: str(row.id),
      name: str(row.name),
      gender: row.gender === 'F' ? 'F' : 'M',
      title: row.title ? str(row.title) : null,
      department: row.department ? str(row.department) : null,
      salary: row.salary === null || row.salary === undefined ? null : num(row.salary),
      hireDate: str(row.hire_date).slice(0, 10),
    })),
  }
}
