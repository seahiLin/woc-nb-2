import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDashboard, findEmployees, pingNeon } from '../lib/dashboard.functions'
import type { Dashboard, EmployeeRow } from '../lib/dashboard-types'
import {
  AreaChart,
  Donut,
  Histogram,
  Panel,
  Sparkline,
  fmtCompact,
  fmtDate,
  fmtInt,
  fmtMoney,
  fmtMoneyCompact,
  fmtPercent,
} from '../components/charts'

export const Route = createFileRoute('/')({
  loader: () => getDashboard(),
  component: DashboardPage,
})

const DEPT_COLORS = [
  '#6366f1',
  '#38bdf8',
  '#22d3ee',
  '#34d399',
  '#a3e635',
  '#fbbf24',
  '#fb923c',
  '#f472b6',
  '#c084fc',
]

function DashboardPage() {
  const initial = Route.useLoaderData()
  const fetchDashboard = useServerFn(getDashboard)
  const fetchEmployees = useServerFn(findEmployees)
  const checkNeon = useServerFn(pingNeon)

  const [result, setResult] = useState(initial)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done'>('idle')

  const dashboard = result.dashboard

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setResult(await fetchDashboard())
    } finally {
      setRefreshing(false)
    }
  }, [fetchDashboard])

  const ping = useCallback(async () => {
    setRefreshing(true)
    try {
      const status = await checkNeon()
      if (status.ok) {
        setResult(await fetchDashboard())
      } else {
        setResult((prev) => ({ ...prev, error: status.error, live: false }))
      }
    } finally {
      setRefreshing(false)
    }
  }, [checkNeon, fetchDashboard])

  // 员工检索：250ms 防抖，避免每敲一个字母打一次库。
  useEffect(() => {
    const term = search.trim()
    if (!term) {
      setRows([])
      setSearchState('idle')
      return
    }
    setSearchState('loading')
    const handle = setTimeout(() => {
      fetchEmployees({ data: { term } })
        .then((response) => {
          setRows(response.rows)
          setSearchState('done')
        })
        .catch(() => {
          setRows([])
          setSearchState('done')
        })
    }, 250)
    return () => clearTimeout(handle)
  }, [search, fetchEmployees])

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-200 selection:bg-sky-500/30">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/12 blur-[140px]" />
        <div className="absolute right-0 bottom-0 h-[420px] w-[620px] rounded-full bg-sky-500/8 blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-[1360px] px-5 pt-8 pb-16 sm:px-8">
        <TopBar
          database={dashboard?.database ?? null}
          live={result.live}
          error={result.error}
          refreshing={refreshing}
          onRefresh={refresh}
          onPing={ping}
        />

        {dashboard ? (
          <DashboardBody dashboard={dashboard} />
        ) : (
          <EmptyState error={result.error} onRetry={ping} />
        )}

        <EmployeeSearch value={search} onChange={setSearch} rows={rows} state={searchState} />

        <footer className="mt-10 flex flex-col gap-2 border-t border-white/[0.06] pt-5 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            数据源 · Neon Postgres <code className="text-slate-500">employees</code> schema（employee /
            department / department_employee / department_manager / salary / title）
          </span>
          <span className="tabular-nums">
            口径：to_date = 9999-01-01 视为当前有效 · 生成于{' '}
            {dashboard ? fmtDate(dashboard.generatedAt) : '—'}
          </span>
        </footer>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 顶部                                                                */
/* ------------------------------------------------------------------ */

function TopBar({
  database,
  live,
  error,
  refreshing,
  onRefresh,
  onPing,
}: {
  database: string | null
  live: boolean
  error: string | null
  refreshing: boolean
  onRefresh: () => void
  onPing: () => void
}) {
  const status = live ? 'live' : error ? 'error' : 'cache'
  const statusCopy = {
    live: {
      label: 'Neon 实时',
      dot: 'bg-emerald-400',
      ring: 'shadow-[0_0_0_3px_rgba(52,211,153,0.16)]',
    },
    cache: {
      label: 'D1 缓存快照',
      dot: 'bg-amber-400',
      ring: 'shadow-[0_0_0_3px_rgba(251,191,36,0.16)]',
    },
    error: {
      label: '连接异常',
      dot: 'bg-rose-400',
      ring: 'shadow-[0_0_0_3px_rgba(251,113,133,0.16)]',
    },
  }[status]

  return (
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 text-[13px] font-bold text-[#080a0f]">
            E
          </span>
          <span className="text-[11px] font-medium tracking-[0.22em] text-slate-500 uppercase">
            People Intelligence
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[34px]">员工数据看板</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
          组织规模、薪酬结构与任职时长的一屏视图 · 直接读取 Neon 上的{' '}
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[12px] text-slate-300">
            employees
          </code>{' '}
          schema
          {database ? <span className="text-slate-600">（{database}）</span> : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-400">
          <span className={`h-1.5 w-1.5 rounded-full ${statusCopy.dot} ${statusCopy.ring}`} />
          {statusCopy.label}
        </span>
        <button
          type="button"
          onClick={onPing}
          disabled={refreshing}
          className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-400 transition hover:border-white/20 hover:text-slate-200 disabled:opacity-50"
        >
          测试连接
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-medium text-[#080a0f] transition hover:bg-slate-200 disabled:opacity-60"
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full bg-[#080a0f] ${refreshing ? 'animate-pulse' : ''}`}
          />
          {refreshing ? '刷新中…' : '刷新数据'}
        </button>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* 主体                                                                */
/* ------------------------------------------------------------------ */

function DashboardBody({ dashboard }: { dashboard: Dashboard }) {
  const { kpis } = dashboard

  const bands = dashboard.bands.map((band) => ({
    label: fmtMoneyCompact(band.band),
    value: band.count,
  }))

  const hires = dashboard.hires.map((point) => ({ label: String(point.year), value: point.count }))
  const trend = dashboard.salaryTrend.map((point) => ({
    label: String(point.year),
    value: point.avgSalary,
  }))

  const totalHeadcount = dashboard.departments.reduce((sum, dept) => sum + dept.headcount, 0) || 1
  const maxDeptHeadcount = Math.max(...dashboard.departments.map((d) => d.headcount), 1)
  const maxTitleHeadcount = Math.max(...dashboard.titles.map((t) => t.headcount), 1)

  const female = dashboard.gender.find((entry) => entry.gender === 'F')
  const male = dashboard.gender.find((entry) => entry.gender === 'M')

  const avgTenure = useMemo(() => {
    if (!kpis.firstHire || !kpis.lastHire) return 0
    const first = Date.parse(kpis.firstHire)
    const last = Date.parse(kpis.lastHire)
    if (Number.isNaN(first) || Number.isNaN(last)) return 0
    return (last - first) / (1000 * 60 * 60 * 24 * 365.25)
  }, [kpis.firstHire, kpis.lastHire])

  const trendStart = trend[0]?.value ?? 0
  const trendEnd = trend[trend.length - 1]?.value ?? 0
  const trendGrowth = trendStart ? ((trendEnd - trendStart) / trendStart) * 100 : 0

  return (
    <div className="space-y-4">
      {/* KPI 行 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="员工总数"
          value={fmtInt(kpis.headcount)}
          hint={`${fmtCompact(kpis.activeHeadcount)} 人在职`}
          accent="from-sky-400 to-indigo-500"
          spark={hires.map((point) => point.value)}
        />
        <KpiCard
          label="当前平均薪资"
          value={fmtMoney(kpis.avgSalary)}
          hint={`中位数 ${fmtMoney(kpis.medianSalary)}`}
          accent="from-emerald-400 to-teal-500"
          spark={trend.map((point) => point.value)}
        />
        <KpiCard
          label="薪资区间"
          value={`${fmtMoneyCompact(kpis.minSalary)} – ${fmtMoneyCompact(kpis.maxSalary)}`}
          hint={`${fmtCompact(kpis.currentSalaries)} 条当前薪资记录`}
          accent="from-amber-400 to-orange-500"
          spark={bands.map((band) => band.value)}
        />
        <KpiCard
          label="部门数"
          value={fmtInt(kpis.departments)}
          hint={`${fmtInt(kpis.managerRecords)} 条经理任职记录`}
          accent="from-fuchsia-400 to-violet-500"
          spark={dashboard.departments.map((dept) => dept.headcount)}
        />
      </div>

      {/* 主图表区 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="薪酬分布"
          subtitle={`按 $10K 分箱 · 当前 ${fmtCompact(kpis.currentSalaries)} 条薪资`}
          className="xl:col-span-2"
          action={
            <span className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] tabular-nums text-slate-500">
              峰值 {fmtCompact(Math.max(...dashboard.bands.map((band) => band.count), 0))}
            </span>
          }
        >
          <Histogram data={bands} height={150} />
        </Panel>

        <Panel title="性别构成" subtitle="当前在职员工 · 人数与平均薪资">
          <Donut
            slices={[
              { label: '男性', value: male?.headcount ?? 0, color: '#38bdf8' },
              { label: '女性', value: female?.headcount ?? 0, color: '#f472b6' },
            ]}
            centerValue={fmtCompact(kpis.activeHeadcount)}
            centerLabel="在职"
          />
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4 text-xs">
            <div>
              <dt className="text-slate-500">男性均薪</dt>
              <dd className="mt-0.5 tabular-nums text-slate-200">{fmtMoney(male?.avgSalary ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">女性均薪</dt>
              <dd className="mt-0.5 tabular-nums text-slate-200">{fmtMoney(female?.avgSalary ?? 0)}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="招聘节奏"
          subtitle={`${kpis.firstHire.slice(0, 4)} – ${kpis.lastHire.slice(0, 4)} · 入职年份分布`}
          className="xl:col-span-2"
        >
          <Histogram data={hires} height={124} />
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            最近一年只有 {fmtInt(hires[hires.length - 1]?.value ?? 0)} 人入职，而最早一批在{' '}
            {kpis.firstHire.slice(0, 4)} 年；两批人之间跨了约 {avgTenure.toFixed(0)} 年，组织整体偏“老”。
          </p>
        </Panel>

        <Panel title="薪资水位" subtitle="历史平均薪资（按薪资生效年）">
          <div className="h-[150px]">
            <AreaChart points={trend} height={150} />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {trend[0]?.label} → {trend[trend.length - 1]?.label}
            </span>
            <span className="tabular-nums text-emerald-300/90">+{fmtPercent(trendGrowth)}</span>
          </div>
        </Panel>
      </div>

      {/* 部门 + 职衔 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel
          title="部门画像"
          subtitle="人数、经理、平均薪资"
          className="xl:col-span-3"
          action={
            <span className="text-[10px] tabular-nums text-slate-500">{fmtInt(totalHeadcount)} 人次</span>
          }
        >
          <div className="space-y-3.5">
            {dashboard.departments.map((dept, index) => (
              <div key={dept.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="w-9 shrink-0 text-[10px] tabular-nums text-slate-600">{dept.id}</span>
                    <span className="truncate text-sm text-slate-200">{dept.name}</span>
                    <span className="hidden truncate text-[11px] text-slate-500 sm:inline">
                      · {dept.manager ?? '—'}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-3 text-[11px] tabular-nums">
                    <span className="text-slate-300">{fmtInt(dept.headcount)}</span>
                    <span className="w-14 text-right text-emerald-300/80">
                      {fmtMoneyCompact(dept.avgSalary)}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.max((dept.headcount / maxDeptHeadcount) * 100, 2)}%`,
                      background: `linear-gradient(90deg, ${DEPT_COLORS[index % DEPT_COLORS.length]}55, ${
                        DEPT_COLORS[index % DEPT_COLORS.length]
                      })`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="职衔结构" subtitle="当前职衔人数与均薪" className="xl:col-span-2">
          <div className="space-y-3">
            {dashboard.titles.map((item, index) => (
              <div key={item.title}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] text-slate-300">{item.title}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                    {fmtCompact(item.headcount)} · {fmtMoneyCompact(item.avgSalary)}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max((item.headcount / maxTitleHeadcount) * 100, 2)}%`,
                      background: DEPT_COLORS[(index + 3) % DEPT_COLORS.length],
                      opacity: 0.75,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* 榜单 + 数据字典 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="薪酬 Top 8" subtitle="当前薪资最高的员工">
          <ol className="divide-y divide-white/[0.05]">
            {dashboard.topEarners.map((person, index) => (
              <li key={person.id} className="flex items-center gap-3 py-2.5">
                <span className="w-4 text-[11px] tabular-nums text-slate-600">{index + 1}</span>
                <Avatar name={person.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-slate-200">{person.name}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {person.title ?? '—'} · {person.department ?? '—'} · 入职{' '}
                    {person.hireDate.slice(0, 4)}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] font-medium tabular-nums text-emerald-300/90">
                  {fmtMoney(person.salary)}
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="数据字典" subtitle="Neon employees schema 的六张表">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SchemaCard name="employee" rows={kpis.headcount} desc="员工主表 · 姓名 / 性别 / 入职日" />
            <SchemaCard name="department" rows={kpis.departments} desc="部门 · id / dept_name" />
            <SchemaCard name="department_employee" rows={kpis.assignmentRecords} desc="员工-部门任职区间" />
            <SchemaCard name="department_manager" rows={kpis.managerRecords} desc="部门-经理任职区间" />
            <SchemaCard name="salary" rows={kpis.salaryRecords} desc="薪资历史 · amount / 生效区间" />
            <SchemaCard name="title" rows={kpis.titleRecords} desc="职衔历史 · title / 生效区间" />
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 小组件                                                              */
/* ------------------------------------------------------------------ */

function KpiCard({
  label,
  value,
  hint,
  accent,
  spark,
}: {
  label: string
  value: string
  hint: string
  accent: string
  spark: number[]
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#11141c]/80 p-4 transition-colors duration-300 hover:border-white/[0.14]">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent} opacity-60`} />
      <p className="text-[11px] tracking-[0.12em] text-slate-500 uppercase">{label}</p>
      <p className="mt-2 text-[22px] leading-tight font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
      <div className="mt-3 h-9 opacity-70 transition-opacity group-hover:opacity-100">
        <Sparkline values={spark} height={36} />
      </div>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-800 text-[10px] font-medium text-slate-300">
      {initials}
    </span>
  )
}

function SchemaCard({ name, rows, desc }: { name: string; rows: number; desc: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-white/[0.12]">
      <div className="flex items-center justify-between gap-2">
        <code className="truncate text-[12px] text-sky-300/90">{name}</code>
        <span className="shrink-0 text-[10px] tabular-nums text-slate-500">{fmtCompact(rows)}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{desc}</p>
    </div>
  )
}

function EmployeeSearch({
  value,
  onChange,
  rows,
  state,
}: {
  value: string
  onChange: (next: string) => void
  rows: EmployeeRow[]
  state: 'idle' | 'loading' | 'done'
}) {
  return (
    <Panel
      title="员工检索"
      subtitle="按工号、姓或名查询 · 实时打 Neon"
      className="mt-4"
      action={
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="例如 43624 / Pesch / Tokuyasu"
          className="w-56 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-sky-400/50 focus:bg-white/[0.05]"
        />
      }
    >
      {state === 'idle' ? (
        <p className="text-xs text-slate-500">
          输入关键字开始检索。数据来自 <code className="text-slate-400">employees.employee</code> 关联的当前职衔、部门与薪资。
        </p>
      ) : state === 'loading' ? (
        <p className="text-xs text-slate-500">查询中…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500">没有匹配的员工。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="text-[10px] tracking-[0.12em] text-slate-500 uppercase">
                <th className="pb-2 font-medium">工号</th>
                <th className="pb-2 font-medium">姓名</th>
                <th className="pb-2 font-medium">职衔</th>
                <th className="pb-2 font-medium">部门</th>
                <th className="pb-2 text-right font-medium">当前薪资</th>
                <th className="pb-2 text-right font-medium">入职</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map((row) => (
                <tr key={row.id} className="text-slate-300 transition-colors hover:bg-white/[0.02]">
                  <td className="py-2 tabular-nums text-slate-500">{row.id}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <Avatar name={row.name} />
                      {row.name}
                    </span>
                  </td>
                  <td className="py-2 text-slate-400">{row.title ?? '—'}</td>
                  <td className="py-2 text-slate-400">{row.department ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-300/90">
                    {row.salary === null ? '—' : fmtMoney(row.salary)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{row.hireDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function EmptyState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-8 text-center">
      <p className="text-sm font-medium text-rose-200">暂时读不到 Neon 数据</p>
      <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-rose-200/60">
        {error ?? '未知错误'}
      </p>
      <p className="mx-auto mt-3 max-w-xl text-[11px] leading-relaxed text-slate-500">
        检查 Worker 的 <code className="text-slate-400">CONNECTION_STRING</code> 密钥是否指向 Neon 的{' '}
        <code className="text-slate-400">neondb</code> 库；连接恢复后这里会自动显示实时数据。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-full bg-white px-4 py-1.5 text-[11px] font-medium text-[#080a0f] transition hover:bg-slate-200"
      >
        重新连接
      </button>
    </div>
  )
}
