/**
 * 看板的数据结构（客户端可安全引用，不含任何服务端代码）。
 */

export type DataSource = 'neon' | 'cache'

export interface Kpis {
  headcount: number
  departments: number
  activeHeadcount: number
  currentSalaries: number
  avgSalary: number
  medianSalary: number
  maxSalary: number
  minSalary: number
  salaryRecords: number
  titleRecords: number
  assignmentRecords: number
  managerRecords: number
  firstHire: string
  lastHire: string
}

export interface SalaryBand {
  band: number
  count: number
}

export interface DepartmentStat {
  id: string
  name: string
  manager: string | null
  headcount: number
  avgSalary: number
  maxSalary: number
}

export interface TitleStat {
  title: string
  headcount: number
  avgSalary: number
}

export interface HireYear {
  year: number
  count: number
}

export interface GenderStat {
  gender: 'M' | 'F'
  headcount: number
  avgSalary: number
}

export interface TopEarner {
  id: string
  name: string
  title: string | null
  department: string | null
  salary: number
  hireDate: string
}

export interface SalaryTrendPoint {
  year: number
  avgSalary: number
  records: number
}

export interface Dashboard {
  /** 数据生成时间（ISO 字符串）。 */
  generatedAt: string
  /** neon = 实时查询；cache = Neon 不可用时回退到 D1 快照。 */
  source: DataSource
  database: string
  kpis: Kpis
  bands: SalaryBand[]
  departments: DepartmentStat[]
  titles: TitleStat[]
  hires: HireYear[]
  gender: GenderStat[]
  topEarners: TopEarner[]
  salaryTrend: SalaryTrendPoint[]
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
