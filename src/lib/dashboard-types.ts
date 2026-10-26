/**
 * 看板的数据结构（客户端可安全引用，不含任何服务端代码）。
 *
 * 口径：`to_date = '9999-01-01'` 视为“当前有效”。数据集的时间基准
 * （`asOf`）取薪资历史里最后一个真实结束日，即 2002-08-01 —— 所有
 * “在职 / 当前薪酬”都是相对这一天而言。
 */

export interface Totals {
  /** 历史上出现过的全部员工。 */
  employees: number
  /** 当前仍在职（有 to_date = 9999-01-01 的部门任职记录）。 */
  activeEmployees: number
  departments: number
  /** 以下薪酬指标均基于“当前有效”的薪资记录。 */
  avgSalary: number
  medianSalary: number
  p25Salary: number
  p75Salary: number
  minSalary: number
  maxSalary: number
  /** 在职员工的平均司龄（年），相对 asOf。 */
  avgTenureYears: number
}

export interface SalaryBucket {
  /** 区间下界（含），单位美元。 */
  from: number
  /** 区间上界（不含），单位美元。 */
  to: number
  count: number
}

export interface SalaryDistribution {
  buckets: SalaryBucket[]
  median: number
  mean: number
}

export interface RetentionYear {
  year: number
  hired: number
  /** 其中当前仍在职的人数。 */
  active: number
}

export interface Manager {
  name: string
  /** 任职起始日。 */
  since: string
  salary: number
}

export interface DepartmentStat {
  id: string
  name: string
  headcount: number
  /** 占在职员工的比例（0–1）。 */
  share: number
  avgSalary: number
  medianSalary: number
  minSalary: number
  maxSalary: number
  femaleShare: number
  manager: Manager | null
}

export interface TitleStat {
  title: string
  headcount: number
  avgSalary: number
  medianSalary: number
  minSalary: number
  maxSalary: number
  femaleShare: number
  /** 同一职衔内男女平均薪酬，用于看“同岗差异”。 */
  maleAvg: number
  femaleAvg: number
}

export interface GenderGroup {
  headcount: number
  avgSalary: number
  medianSalary: number
}

export interface GenderSplit {
  male: GenderGroup
  female: GenderGroup
}

export interface TopEarner {
  id: string
  name: string
  title: string | null
  department: string | null
  salary: number
  hireDate: string
}

export interface Dashboard {
  /** 本次查询时间（ISO 字符串）。 */
  generatedAt: string
  /** 数据集的时间基准日（YYYY-MM-DD）。 */
  asOf: string
  totals: Totals
  distribution: SalaryDistribution
  retention: RetentionYear[]
  departments: DepartmentStat[]
  titles: TitleStat[]
  gender: GenderSplit
  topEarners: TopEarner[]
}

export interface EmployeeRow {
  id: string
  name: string
  gender: 'M' | 'F'
  title: string | null
  department: string | null
  salary: number | null
  hireDate: string
}

export interface SearchResult {
  rows: EmployeeRow[]
  /** 命中上限被截断（结果多于展示条数）。 */
  truncated: boolean
  error: string | null
}
