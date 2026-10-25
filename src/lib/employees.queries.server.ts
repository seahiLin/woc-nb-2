/**
 * 看板的所有查询 —— 全部用 Drizzle 写。
 *
 * 表和列来自 `src/db/schema.ts`（和迁移同一份定义）；聚合、percentile、
 * 条件计数这类 Drizzle 没有专门 API 的部分用 `sql` 模板补，参数仍然走占位符。
 *
 * 口径：
 *   * `to_date = '9999-01-01'` 表示“当前有效”。
 *   * 时间基准取薪资历史里最后一个真实结束日的次日，不写死。
 *   * 同一员工在同一时点只有一条当前职级/部门/薪资，join 不会放大行数。
 */

import { and, asc, count, desc, eq, ne, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import {
  department,
  departmentEmployee,
  departmentManager,
  employee,
  salary,
  title,
} from '../db/schema'
import type { Queryable } from './neon.server'
import { databaseName, withDb } from './neon.server'
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

/** 当前有效的日期哨兵值。 */
const CURRENT = sql`'9999-01-01'::date`

/** pg 把 count / bigint 解成字符串，这里统一转成 number。 */
const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value)

/** pg 的 numeric 到 0–1 比例，null 归零。 */
const ratio = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0
}

/** 把稀疏的分档结果补齐成连续区间，图表才不会缺柱子。 */
function fillBuckets(rows: Array<{ bucket: unknown; n: unknown }>): SalaryBucket[] {
  if (rows.length === 0) return []
  const counts = new Map<number, number>()
  for (const row of rows) counts.set(num(row.bucket), num(row.n))

  const min = Math.min(...counts.keys())
  const max = Math.max(...counts.keys())
  const buckets: SalaryBucket[] = []
  for (let from = min; from <= max; from += 5000) {
    buckets.push({ from, to: from + 5000, count: counts.get(from) ?? 0 })
  }
  return buckets
}

/* ------------------------------------------------------------------ */
/* 可复用的子查询                                                       */
/* ------------------------------------------------------------------ */

/** 当前有效的薪资（每人一条）。 */
const currentSalary = (db: Queryable) =>
  db
    .select({ employeeId: salary.employeeId, amount: salary.amount })
    .from(salary)
    .where(eq(salary.toDate, CURRENT))
    .as('cur_salary')

/** 当前有效的部门任职（每人一条）。 */
const currentAssignment = (db: Queryable) =>
  db
    .select({
      employeeId: departmentEmployee.employeeId,
      departmentId: departmentEmployee.departmentId,
    })
    .from(departmentEmployee)
    .where(eq(departmentEmployee.toDate, CURRENT))
    .as('cur_dept')

/** 全名（原数据集拆成 first/last 两列）。 */
const fullName = sql<string>`${employee.firstName} || ' ' || ${employee.lastName}`

/* ------------------------------------------------------------------ */
/* 各切片                                                              */
/* ------------------------------------------------------------------ */

/**
 * 数据集的时间基准：薪资历史里最后一个真实结束日的次日。
 * 用作 date，因为司龄要用它做日期算术。
 */
const asOfDate = sql`(
  select (max(${salary.toDate}) + 1)::date from ${salary} where ${ne(salary.toDate, CURRENT)}
)`

/** 执行一段原始 SQL 并拿到行。neon-serverless 返回 QueryResult，这里兼容两种形态。 */
async function rawRows<T>(db: Queryable, query: SQL): Promise<T[]> {
  const result = await db.execute(query)
  const maybe = result as unknown as { rows?: T[] }
  return Array.isArray(maybe.rows) ? maybe.rows : (result as unknown as T[])
}

/** 汇总行（列名是 SQL 里的 snake_case）。 */
type TotalsRow = {
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

async function loadTotals(db: Queryable) {
  const result = await rawRows<TotalsRow>(
    db,
    sql`
      with cur_salary as (
        select ${salary.amount} as amount from ${salary} where ${eq(salary.toDate, CURRENT)}
      ),
      cur_dept as (
        select ${departmentEmployee.employeeId} as employee_id
        from ${departmentEmployee}
        where ${eq(departmentEmployee.toDate, CURRENT)}
      ),
      as_of as (${asOfDate})
      select
        (select count(*) from ${employee})::int as employees,
        (select count(*) from cur_dept)::int as active_employees,
        (select count(*) from ${department})::int as departments,
        (select count(*) from ${salary})::int as salary_records,
        (select count(*) from ${title})::int as title_records,
        (select count(*) from ${departmentEmployee})::int as assignment_records,
        (select count(*) from ${departmentManager})::int as manager_records,
        (select round(avg(amount)) from cur_salary)::int as avg_salary,
        (select round(percentile_cont(0.5) within group (order by amount))
          from cur_salary)::int as median_salary,
        (select round(percentile_cont(0.25) within group (order by amount))
          from cur_salary)::int as p25_salary,
        (select round(percentile_cont(0.75) within group (order by amount))
          from cur_salary)::int as p75_salary,
        (select min(amount) from cur_salary)::int as min_salary,
        (select max(amount) from cur_salary)::int as max_salary,
        (select min(${employee.hireDate})::text from ${employee}) as first_hire,
        (select max(${employee.hireDate})::text from ${employee}) as last_hire,
        (select round(avg(((select * from as_of) - ${employee.hireDate}) / 365.25))
           from ${employee}
           join cur_dept on cur_dept.employee_id = ${employee.id})::int as avg_tenure_years,
        (select * from as_of)::text as as_of,
        current_database() as database_name
    `,
  )

  const row = result[0]
  if (!row) throw new Error('数据库没有返回汇总行')
  return row
}

/**
 * 薪资分布：$5K 一档，最后一档兜住所有 $120K 以上。
 * 用手写区间而不是 width_bucket，是为了让横轴标签是整数好读。
 */
async function loadDistribution(db: Queryable) {
  const bucket = sql<number>`case
    when ${salary.amount} >= 120000 then 120000
    else (floor(${salary.amount} / 5000.0) * 5000)::int
  end`

  return db
    .select({ bucket, n: count() })
    .from(salary)
    .where(eq(salary.toDate, CURRENT))
    .groupBy(bucket)
    .orderBy(asc(bucket))
}

/**
 * 招聘与留存：每年招了多少人，其中多少人到今天还在职。
 * 这是整个数据集最有信息量的一张图 —— 招得越晚，留下的越少。
 */
async function loadRetention(db: Queryable) {
  const curDept = currentAssignment(db)
  const year = sql<number>`extract(year from ${employee.hireDate})::int`

  return db
    .select({
      year,
      hired: count(),
      active: sql<number>`count(${curDept.employeeId})::int`,
    })
    .from(employee)
    .leftJoin(curDept, eq(curDept.employeeId, employee.id))
    .groupBy(year)
    .orderBy(asc(year))
}

async function loadDepartments(db: Queryable) {
  const curDept = currentAssignment(db)
  const curSalary = currentSalary(db)
  const curManager = db
    .select({
      departmentId: departmentManager.departmentId,
      employeeId: departmentManager.employeeId,
      fromDate: departmentManager.fromDate,
    })
    .from(departmentManager)
    .where(eq(departmentManager.toDate, CURRENT))
    .as('cur_mgr')

  // 经理是“每部门一条”的独立维度，单独查出来再在 JS 里合并，
  // 免得把它 join 进主聚合后放大行数。
  const managers = await db
    .select({
      departmentId: curManager.departmentId,
      name: fullName,
      since: sql<string>`${curManager.fromDate}::text`,
      salary: sql<number | null>`${curSalary.amount}::int`,
    })
    .from(curManager)
    .innerJoin(employee, eq(employee.id, curManager.employeeId))
    .leftJoin(curSalary, eq(curSalary.employeeId, curManager.employeeId))

  const rows = await db
    .select({
      id: department.id,
      name: department.deptName,
      headcount: sql<number>`count(${curDept.employeeId})::int`,
      avgSalary: sql<number>`round(avg(${curSalary.amount}))::int`,
      medianSalary: sql<number>`round(percentile_cont(0.5) within group (order by ${curSalary.amount}))::int`,
      minSalary: sql<number>`min(${curSalary.amount})::int`,
      maxSalary: sql<number>`max(${curSalary.amount})::int`,
      femaleShare: sql<number>`round(
        (count(*) filter (where ${employee.gender} = 'F'))::numeric
        / nullif(count(${curDept.employeeId}), 0), 3)`,
    })
    .from(department)
    .leftJoin(curDept, eq(curDept.departmentId, department.id))
    .leftJoin(employee, eq(employee.id, curDept.employeeId))
    .leftJoin(curSalary, eq(curSalary.employeeId, curDept.employeeId))
    .groupBy(department.id, department.deptName)
    .orderBy(desc(sql`count(${curDept.employeeId})`))

  const activeTotal = rows.reduce((sum, row) => sum + num(row.headcount), 0)
  const managerByDept = new Map(managers.map((row) => [str(row.departmentId), row]))

  return rows.map<DepartmentStat>((row) => {
    const manager = managerByDept.get(str(row.id))
    return {
      id: str(row.id),
      name: str(row.name),
      headcount: num(row.headcount),
      share: activeTotal > 0 ? num(row.headcount) / activeTotal : 0,
      avgSalary: num(row.avgSalary),
      medianSalary: num(row.medianSalary),
      minSalary: num(row.minSalary),
      maxSalary: num(row.maxSalary),
      femaleShare: ratio(row.femaleShare),
      manager: manager
        ? {
            name: str(manager.name),
            since: str(manager.since).slice(0, 10),
            salary: num(manager.salary),
          }
        : null,
    }
  })
}

async function loadTitles(db: Queryable) {
  const curSalary = currentSalary(db)

  const rows = await db
    .select({
      title: title.title,
      headcount: count(),
      avgSalary: sql<number>`round(avg(${curSalary.amount}))::int`,
      medianSalary: sql<number>`round(percentile_cont(0.5) within group (order by ${curSalary.amount}))::int`,
      minSalary: sql<number>`min(${curSalary.amount})::int`,
      maxSalary: sql<number>`max(${curSalary.amount})::int`,
      femaleShare: sql<number>`round(
        (count(*) filter (where ${employee.gender} = 'F'))::numeric / nullif(count(*), 0), 3)`,
      maleAvg: sql<number | null>`round(avg(${curSalary.amount}) filter (where ${employee.gender} = 'M'))::int`,
      femaleAvg: sql<number | null>`round(avg(${curSalary.amount}) filter (where ${employee.gender} = 'F'))::int`,
    })
    .from(title)
    .innerJoin(curSalary, eq(curSalary.employeeId, title.employeeId))
    .innerJoin(employee, eq(employee.id, title.employeeId))
    .where(eq(title.toDate, CURRENT))
    .groupBy(title.title)
    .orderBy(desc(count()))

  return rows.map<TitleStat>((row) => ({
    title: str(row.title),
    headcount: num(row.headcount),
    avgSalary: num(row.avgSalary),
    medianSalary: num(row.medianSalary),
    minSalary: num(row.minSalary),
    maxSalary: num(row.maxSalary),
    femaleShare: ratio(row.femaleShare),
    maleAvg: num(row.maleAvg),
    femaleAvg: num(row.femaleAvg),
  }))
}

async function loadGender(db: Queryable) {
  const curSalary = currentSalary(db)

  const rows = await db
    .select({
      gender: employee.gender,
      headcount: count(),
      avgSalary: sql<number>`round(avg(${curSalary.amount}))::int`,
      medianSalary: sql<number>`round(percentile_cont(0.5) within group (order by ${curSalary.amount}))::int`,
    })
    .from(curSalary)
    .innerJoin(employee, eq(employee.id, curSalary.employeeId))
    .groupBy(employee.gender)

  const toGroup = (row: (typeof rows)[number] | undefined): GenderGroup => ({
    headcount: num(row?.headcount),
    avgSalary: num(row?.avgSalary),
    medianSalary: num(row?.medianSalary),
  })

  return {
    male: toGroup(rows.find((row) => row.gender === 'M')),
    female: toGroup(rows.find((row) => row.gender === 'F')),
  }
}

async function loadTrend(db: Queryable) {
  const year = sql<number>`extract(year from ${salary.fromDate})::int`

  const rows = await db
    .select({
      year,
      avgSalary: sql<number>`round(avg(${salary.amount}))::int`,
      records: count(),
    })
    .from(salary)
    .groupBy(year)
    .orderBy(asc(year))

  return rows.map<TrendPoint>((row) => ({
    year: num(row.year),
    avgSalary: num(row.avgSalary),
    records: num(row.records),
  }))
}

async function loadTopEarners(db: Queryable) {
  const curSalary = currentSalary(db)

  const rows = await db
    .select({
      id: sql<string>`${employee.id}::text`,
      name: fullName,
      title: title.title,
      department: department.deptName,
      salary: sql<number>`${curSalary.amount}::int`,
      hireDate: sql<string>`${employee.hireDate}::text`,
    })
    .from(curSalary)
    .innerJoin(employee, eq(employee.id, curSalary.employeeId))
    .leftJoin(title, and(eq(title.employeeId, employee.id), eq(title.toDate, CURRENT)))
    .leftJoin(
      departmentEmployee,
      and(
        eq(departmentEmployee.employeeId, employee.id),
        eq(departmentEmployee.toDate, CURRENT),
      ),
    )
    .leftJoin(department, eq(department.id, departmentEmployee.departmentId))
    .orderBy(desc(curSalary.amount))
    .limit(10)

  return rows.map<TopEarner>((row) => ({
    id: str(row.id),
    name: str(row.name),
    title: row.title ? str(row.title) : null,
    department: row.department ? str(row.department) : null,
    salary: num(row.salary),
    hireDate: str(row.hireDate).slice(0, 10),
  }))
}

/* ------------------------------------------------------------------ */
/* 组装                                                                */
/* ------------------------------------------------------------------ */

/** 一次只读事务，把看板需要的所有切片取回来 —— 所有数字来自同一个快照。 */
export async function loadDashboard(connectionString: string): Promise<Dashboard> {
  return withDb(connectionString, async (db) =>
    db.transaction(
      async (tx) => {
        // 串行执行：事务固定在同一条连接上，并发只会排队，不省时间，
        // 而且串行能让 SQL 报错时立刻定位到是哪一段。
        const totals = await loadTotals(tx)
        const distribution = await loadDistribution(tx)
        const retention = await loadRetention(tx)
        const departments = await loadDepartments(tx)
        const titles = await loadTitles(tx)
        const gender = await loadGender(tx)
        const salaryTrend = await loadTrend(tx)
        const topEarners = await loadTopEarners(tx)

        return {
          generatedAt: new Date().toISOString(),
          source: 'neon',
          database: str(totals.database_name) || databaseName(connectionString),
          asOf: str(totals.as_of).slice(0, 10),
          totals: {
            employees: num(totals.employees),
            activeEmployees: num(totals.active_employees),
            departments: num(totals.departments),
            salaryRecords: num(totals.salary_records),
            titleRecords: num(totals.title_records),
            assignmentRecords: num(totals.assignment_records),
            managerRecords: num(totals.manager_records),
            avgSalary: num(totals.avg_salary),
            medianSalary: num(totals.median_salary),
            p25Salary: num(totals.p25_salary),
            p75Salary: num(totals.p75_salary),
            minSalary: num(totals.min_salary),
            maxSalary: num(totals.max_salary),
            firstHire: str(totals.first_hire),
            lastHire: str(totals.last_hire),
            avgTenureYears: num(totals.avg_tenure_years),
          },
          distribution: {
            buckets: fillBuckets(distribution),
            median: num(totals.median_salary),
            mean: num(totals.avg_salary),
          },
          retention: retention.map<RetentionYear>((row) => ({
            year: num(row.year),
            hired: num(row.hired),
            active: num(row.active),
          })),
          departments,
          titles,
          gender,
          salaryTrend,
          topEarners,
        } satisfies Dashboard
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    ),
  )
}

/* ------------------------------------------------------------------ */
/* 员工检索                                                            */
/* ------------------------------------------------------------------ */

/**
 * 员工检索：工号精确匹配，或姓名片段模糊匹配。
 * 先把候选集缩到 26 条（多取一条用于判断是否截断），再回表取当前职级/部门/薪资。
 */
export async function searchEmployees(
  connectionString: string,
  term: string,
): Promise<{ rows: EmployeeRow[]; truncated: boolean }> {
  return withDb(connectionString, async (db) => {
    const trimmed = term.trim()
    const exactId = /^\d+$/.test(trimmed) ? Number(trimmed) : -1
    const like = `%${trimmed}%`

    const rows = await db
      .select({
        id: sql<string>`${employee.id}::text`,
        name: fullName,
        gender: employee.gender,
        title: title.title,
        department: department.deptName,
        salary: sql<number | null>`${salary.amount}::int`,
        hireDate: sql<string>`${employee.hireDate}::text`,
      })
      .from(employee)
      .leftJoin(title, and(eq(title.employeeId, employee.id), eq(title.toDate, CURRENT)))
      .leftJoin(
        departmentEmployee,
        and(
          eq(departmentEmployee.employeeId, employee.id),
          eq(departmentEmployee.toDate, CURRENT),
        ),
      )
      .leftJoin(department, eq(department.id, departmentEmployee.departmentId))
      .leftJoin(salary, and(eq(salary.employeeId, employee.id), eq(salary.toDate, CURRENT)))
      .where(
        sql`${employee.id} = ${exactId}
          or ${employee.firstName} ilike ${like}
          or ${employee.lastName} ilike ${like}`,
      )
      .orderBy(asc(employee.id))
      .limit(26)

    return {
      truncated: rows.length > 25,
      rows: rows.slice(0, 25).map<EmployeeRow>((row) => ({
        id: str(row.id),
        name: str(row.name),
        gender: row.gender === 'F' ? 'F' : 'M',
        title: row.title ? str(row.title) : null,
        department: row.department ? str(row.department) : null,
        salary: row.salary === null || row.salary === undefined ? null : num(row.salary),
        hireDate: str(row.hireDate).slice(0, 10),
      })),
    }
  })
}

/** 连接自检：给页面一个“重新连接”的按钮。 */
export async function pingDatabase(connectionString: string): Promise<string> {
  return withDb(connectionString, async (db) => {
    const result = await rawRows<{ name: string }>(db, sql`select current_database() as name`)
    return str(result[0]?.name)
  })
}
