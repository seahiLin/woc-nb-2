import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { findEmployees, getDashboard } from '../lib/dashboard.functions'
import type { Dashboard, EmployeeRow } from '../lib/dashboard-types'
import {
  Caption,
  DepartmentBars,
  DistributionChart,
  RangeBar,
  RetentionChart,
  Section,
  fmtDate,
  fmtInt,
  fmtMoney,
  fmtMoneyShort,
  fmtPercent,
  fmtYearMonth,
} from '../components/charts'

export const Route = createFileRoute('/')({
  loader: () => getDashboard({ data: { force: false } }),
  component: DashboardPage,
})

function DashboardPage() {
  const initial = Route.useLoaderData()
  const fetchDashboard = useServerFn(getDashboard)

  const [result, setResult] = useState(initial)
  const [refreshing, setRefreshing] = useState(false)

  const dashboard = result.dashboard

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setResult(await fetchDashboard({ data: { force: true } }))
    } finally {
      setRefreshing(false)
    }
  }, [fetchDashboard])

  return (
    <div className="mx-auto max-w-[900px] px-5 pb-32 sm:px-8">
      <Masthead dashboard={dashboard} refreshing={refreshing} onRefresh={refresh} />

      {dashboard ? (
        <main>
          <Opening dashboard={dashboard} />
          <Departments dashboard={dashboard} />
          <Hiring dashboard={dashboard} />
          <Titles dashboard={dashboard} />
          <TopEarners dashboard={dashboard} />
          <Lookup />
          <footer className="mt-16 border-t border-rule pt-5 font-sans text-[11.5px] leading-relaxed text-ink-faint">
            记录覆盖 {dashboard.retention[0]?.year}–
            {dashboard.retention[dashboard.retention.length - 1]?.year} 年入职的{' '}
            {fmtInt(dashboard.totals.employees)} 人，统计基准日{' '}
            {fmtDate(dashboard.asOf)}。
          </footer>
        </main>
      ) : (
        <Unavailable error={result.error} onRetry={refresh} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 页眉：登记册的表头                                                    */
/* ------------------------------------------------------------------ */

function Masthead({
  dashboard,
  refreshing,
  onRefresh,
}: {
  dashboard: Dashboard | null
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <header className="flex items-baseline justify-between gap-4 border-b border-ink py-4">
      <p className="text-[15px] font-medium">员工与薪酬</p>
      <div className="flex items-baseline gap-5">
        <p className="font-sans text-[11.5px] tabular text-ink-faint">
          {dashboard ? fmtYearMonth(dashboard.asOf) : ''}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="font-sans text-[11.5px] text-ink-soft underline decoration-rule-strong underline-offset-4 transition hover:text-ink hover:decoration-ink disabled:opacity-40"
        >
          {refreshing ? '更新中' : '重新统计'}
        </button>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* 开场：直接把分布摆出来，用图本身当标题                                 */
/* ------------------------------------------------------------------ */

function Opening({ dashboard }: { dashboard: Dashboard }) {
  const { totals, distribution, departments } = dashboard

  const highest = departments.reduce(
    (best, d) => (d.avgSalary > best.avgSalary ? d : best),
    departments[0],
  )

  return (
    <div className="pt-12 sm:pt-16">
      <h1 className="max-w-[14em] text-[27px] leading-[1.34] font-medium tracking-[-0.01em] text-balance sm:text-[33px]">
        {fmtInt(totals.activeEmployees)} 名在职员工的年薪，
        一半挤在 {fmtMoneyShort(totals.p25Salary)} 到 {fmtMoneyShort(totals.p75Salary)} 之间
      </h1>

      <p className="mt-4 max-w-[52ch] text-[15.5px] leading-[1.85] text-ink-soft">
        中位 {fmtMoney(totals.medianSalary)}，均值 {fmtMoney(totals.avgSalary)}。
        右边那条长尾把均值抬了起来。给得最多的是 {highest?.name}，平均{' '}
        {fmtMoney(highest?.avgSalary ?? 0)}。
      </p>

      <figure className="mt-9">
        <DistributionChart
          buckets={distribution.buckets}
          median={distribution.median}
          p25={totals.p25Salary}
          p75={totals.p75Salary}
        />
      </figure>

      <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-rule pt-5">
        <Figure label="累计雇员" value={fmtInt(totals.employees)} />
        <Figure label="平均司龄" value={`${totals.avgTenureYears} 年`} />
        <Figure
          label="年薪区间"
          value={`${fmtMoneyShort(totals.minSalary)}–${fmtMoneyShort(totals.maxSalary)}`}
        />
      </dl>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="font-sans text-[11.5px] text-ink-faint">{label}</dt>
      <dd className="text-[15px] tabular">{value}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 部门                                                                */
/* ------------------------------------------------------------------ */

function Departments({ dashboard }: { dashboard: Dashboard }) {
  const { departments, totals } = dashboard

  const bySalary = useMemo(
    () => [...departments].sort((a, b) => b.avgSalary - a.avgSalary),
    [departments],
  )
  const highest = bySalary[0]
  const lowest = bySalary[bySalary.length - 1]
  const biggest = departments.reduce(
    (best, d) => (d.headcount > best.headcount ? d : best),
    departments[0],
  )
  const biggestRank = biggest ? bySalary.findIndex((d) => d.id === biggest.id) + 1 : 0

  return (
    <Section
      title={
        <>
          {highest?.name} 平均 {fmtMoneyShort(highest?.avgSalary ?? 0)}，
          比 {lowest?.name} 高 {fmtMoneyShort((highest?.avgSalary ?? 0) - (lowest?.avgSalary ?? 0))}
        </>
      }
      lede={
        <>
          {biggest?.name} 人最多，有 {fmtInt(biggest?.headcount ?? 0)} 人，平均薪酬却只排第{' '}
          {biggestRank}；给得最多的 {highest?.name} 平均 {fmtMoney(highest?.avgSalary ?? 0)}，
          人数只排第 {bySalary.length - bySalary.findIndex((d) => d.id === highest?.id)}。
        </>
      }
    >
      <DepartmentBars rows={bySalary} average={totals.avgSalary} />
      <Caption>
        条形是各部门与红线（全员平均）的距离
      </Caption>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 招聘与留存                                                          */
/* ------------------------------------------------------------------ */

function Hiring({ dashboard }: { dashboard: Dashboard }) {
  const { retention } = dashboard
  const first = retention[0]
  const last = retention[retention.length - 1]
  const peak = retention.reduce((best, row) => (row.hired > best.hired ? row : best), retention[0])

  return (
    <Section
      title={<>{last?.year} 年只招了 {fmtInt(last?.hired ?? 0)} 人</>}
      lede={
        <>
          从 {peak?.year} 年的 {fmtInt(peak?.hired ?? 0)} 人一路降到 {last?.year} 年的{' '}
          {fmtInt(last?.hired ?? 0)} 人，十六年里几乎停下来。但招进来的人留得住：
          {first?.year} 年入职的那一批，到 {fmtYearMonth(dashboard.asOf)} 仍有{' '}
          {fmtPercent((first?.active ?? 0) / Math.max(first?.hired ?? 1, 1))} 在职。
        </>
      }
    >
      <RetentionChart data={retention} />
      <Caption>每行一年，深色是到 {fmtYearMonth(dashboard.asOf)} 仍在职的人</Caption>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 职衔与性别                                                          */
/* ------------------------------------------------------------------ */

function Titles({ dashboard }: { dashboard: Dashboard }) {
  const { titles, gender } = dashboard

  const domain = useMemo(() => {
    const mins = titles.map((t) => t.minSalary).filter((v) => v > 0)
    const maxs = titles.map((t) => t.maxSalary).filter((v) => v > 0)
    return { min: mins.length ? Math.min(...mins) : 0, max: maxs.length ? Math.max(...maxs) : 1 }
  }, [titles])

  const total = gender.male.headcount + gender.female.headcount
  const femaleShare = total > 0 ? gender.female.headcount / total : 0
  const overallGap =
    gender.male.avgSalary > 0
      ? (gender.female.avgSalary - gender.male.avgSalary) / gender.male.avgSalary
      : 0

  // 只看样本足够大的职衔，避免 9 人的 Manager 把结论带偏。
  const comparable = titles.filter((t) => t.maleAvg > 0 && t.femaleAvg > 0 && t.headcount >= 3000)
  const worstGap = comparable.length
    ? Math.max(...comparable.map((t) => Math.abs((t.femaleAvg - t.maleAvg) / t.maleAvg)))
    : 0

  return (
    <Section
      title={<>男女平均年薪差 {fmtPercent(Math.abs(overallGap), 1)}</>}
      lede={
        <>
          女性 {fmtInt(gender.female.headcount)} 人，平均 {fmtMoney(gender.female.avgSalary)}；
          男性 {fmtInt(gender.male.headcount)} 人，平均 {fmtMoney(gender.male.avgSalary)}。
          拆到职衔内部也一样，差距最大的一项只有 {fmtPercent(worstGap, 1)}。
        </>
      }
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-rule-strong">
            <Th>职衔</Th>
            <Th align="right">人数</Th>
            <Th align="right">平均年薪</Th>
            <Th className="hidden w-[24%] sm:table-cell">最低 – 最高</Th>
            <Th align="right">女性</Th>
          </tr>
        </thead>
        <tbody>
          {titles.map((row) => (
            <tr key={row.title} className="border-b border-rule/70 last:border-0">
              <td className="py-2.5 pr-4 text-[15px]">{row.title}</td>
              <td className="py-2.5 pr-4 text-right text-[13.5px] tabular text-ink-soft">
                {fmtInt(row.headcount)}
              </td>
              <td className="py-2.5 pr-4 text-right text-[14.5px] tabular">
                {fmtMoney(row.avgSalary)}
              </td>
              <td className="hidden py-2.5 pr-4 sm:table-cell">
                <RangeBar
                  min={row.minSalary}
                  max={row.maxSalary}
                  median={row.medianSalary}
                  domainMin={domain.min}
                  domainMax={domain.max}
                />
              </td>
              <td className="py-2.5 text-right text-[13.5px] tabular text-ink-soft">
                {fmtPercent(row.femaleShare)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Caption>
        竖线为中位数；整体女性占 {fmtPercent(femaleShare)}
      </Caption>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 薪酬最高的十人                                                       */
/* ------------------------------------------------------------------ */

function TopEarners({ dashboard }: { dashboard: Dashboard }) {
  const { topEarners, totals } = dashboard
  const first = topEarners[0]
  const last = topEarners[topEarners.length - 1]
  const overMedian =
    totals.medianSalary > 0 ? (first?.salary ?? 0) / totals.medianSalary - 1 : 0

  // 十人往往同职衔同部门，那就说一次，不必每行重复。
  const uniform =
    topEarners.length > 0 &&
    topEarners.every((p) => p.title === first?.title && p.department === first?.department)

  return (
    <Section
      title={
        uniform ? (
          <>最贵的十个人，全是 {first?.title}</>
        ) : (
          <>薪酬最高的十个人</>
        )
      }
      lede={
        first ? (
          <>
            {uniform ? (
              <>
                十人都在 {first.department}。{' '}
              </>
            ) : null}
            第 1 名 {first.name} 年薪 {fmtMoney(first.salary)}，比中位数高出{' '}
            {fmtPercent(overMedian)}；第 10 名 {fmtMoney(last?.salary ?? 0)}。
          </>
        ) : null
      }
    >
      <ol className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {topEarners.map((person, index) => (
          <li key={person.id} className="flex items-baseline gap-3 border-b border-rule/70 py-2">
            <span className="w-5 shrink-0 font-sans text-[11px] tabular text-ink-faint">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px]">{person.name}</span>
            <span className="shrink-0 text-[14.5px] tabular">{fmtMoney(person.salary)}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 检索                                                                */
/* ------------------------------------------------------------------ */

function Lookup() {
  const fetchEmployees = useServerFn(findEmployees)
  const [term, setTerm] = useState('')
  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const query = term.trim()
    if (!query) {
      setRows([])
      setTruncated(false)
      setError(null)
      setState('idle')
      return
    }
    setState('loading')
    const handle = setTimeout(() => {
      fetchEmployees({ data: { term: query } })
        .then((response) => {
          setRows(response.rows)
          setTruncated(response.truncated)
          setError(response.error)
          setState('done')
        })
        .catch((cause: unknown) => {
          setRows([])
          setError(cause instanceof Error ? cause.message : '查询失败')
          setState('done')
        })
    }, 250)
    return () => clearTimeout(handle)
  }, [term, fetchEmployees])

  return (
    <Section title={<>查一个人</>} lede="按工号精确查，或按姓、名的片段模糊查。">
      <div className="relative max-w-[360px]">
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="工号、姓或名"
          aria-label="按工号、姓或名检索员工"
          className="w-full border-b border-rule-strong bg-transparent py-2 pr-7 font-sans text-[13.5px] outline-none transition placeholder:text-ink-faint focus:border-ink"
        />
        {term ? (
          <button
            type="button"
            aria-label="清空"
            onClick={() => {
              setTerm('')
              inputRef.current?.focus()
            }}
            className="absolute top-1/2 right-0 -translate-y-1/2 px-1 font-sans text-[15px] leading-none text-ink-faint transition hover:text-ink"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="mt-5">
        {state === 'idle' ? null : state === 'loading' ? (
          <p className="font-sans text-[12.5px] text-ink-faint">查询中…</p>
        ) : error ? (
          <p className="font-sans text-[12.5px] text-ink-faint">{error}</p>
        ) : rows.length === 0 ? (
          <p className="font-sans text-[12.5px] text-ink-faint">没有匹配的人。</p>
        ) : (
          <>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule-strong">
                  <Th>工号</Th>
                  <Th>姓名</Th>
                  <Th className="hidden sm:table-cell">职衔</Th>
                  <Th className="hidden sm:table-cell">部门</Th>
                  <Th align="right">当前年薪</Th>
                  <Th align="right" className="hidden sm:table-cell">
                    入职
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-rule/70">
                    <td className="py-2 pr-4 font-sans text-[11.5px] tabular text-ink-faint">
                      {row.id}
                    </td>
                    <td className="py-2 pr-4 text-[15px]">{row.name}</td>
                    <td className="hidden py-2 pr-4 text-[13.5px] text-ink-soft sm:table-cell">
                      {row.title ?? '—'}
                    </td>
                    <td className="hidden py-2 pr-4 text-[13.5px] text-ink-soft sm:table-cell">
                      {row.department ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-right text-[14px] tabular">
                      {row.salary === null ? '—' : fmtMoney(row.salary)}
                    </td>
                    <td className="hidden py-2 text-right font-sans text-[11.5px] tabular text-ink-faint sm:table-cell">
                      {fmtDate(row.hireDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {truncated ? (
              <p className="mt-3 font-sans text-[11.5px] text-ink-faint">
                结果多于 25 条，只显示前 25 条。
              </p>
            ) : null}
          </>
        )}
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 小部件                                                              */
/* ------------------------------------------------------------------ */

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <th
      className={`pb-2 font-sans text-[11px] font-normal tracking-[0.03em] text-ink-faint ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  )
}

function Unavailable({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="pt-20">
      <h1 className="text-[24px] font-medium">读不到员工数据</h1>
      <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-ink-soft">
        这通常是暂时的。重新统计一次；如果还是不行，稍后再来。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 border-b border-ink pb-1 text-[14px] transition hover:opacity-60"
      >
        重新统计
      </button>
      {error ? (
        <details className="mt-10 max-w-xl">
          <summary className="cursor-pointer font-sans text-[11.5px] text-ink-faint">
            技术细节
          </summary>
          <p className="mt-2 font-sans text-[11px] leading-relaxed break-words text-ink-faint">
            {error}
          </p>
        </details>
      ) : null}
    </div>
  )
}
