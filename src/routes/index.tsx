import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { findEmployees, getDashboard } from '../lib/dashboard.functions'
import type { Dashboard, DepartmentStat, EmployeeRow } from '../lib/dashboard-types'
import {
  Caption,
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
    <div className="mx-auto max-w-[1060px] px-5 pb-28 sm:px-8">
      <Masthead dashboard={dashboard} refreshing={refreshing} onRefresh={refresh} />

      {dashboard ? (
        <main>
          <Hero dashboard={dashboard} />
          <Distribution dashboard={dashboard} />
          <Departments dashboard={dashboard} />
          <Hiring dashboard={dashboard} />
          <Titles dashboard={dashboard} />
          <TopEarners dashboard={dashboard} />
          <Lookup />
        </main>
      ) : (
        <Unavailable error={result.error} onRetry={refresh} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 页眉                                                                */
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
    <header className="flex items-baseline justify-between gap-4 border-b border-rule py-5">
      <p className="text-[13px] font-semibold tracking-tight text-ink">员工与薪酬</p>
      <div className="flex items-baseline gap-4">
        <p className="font-mono text-[11.5px] tabular text-ink-faint">
          {dashboard ? `截至 ${fmtYearMonth(dashboard.asOf)}` : ''}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="text-[11.5px] text-ink-faint transition hover:text-ink disabled:opacity-40"
        >
          {refreshing ? '更新中' : '更新'}
        </button>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* 首屏：两个数字 + 一句背景                                            */
/* ------------------------------------------------------------------ */

function Hero({ dashboard }: { dashboard: Dashboard }) {
  const { totals, departments } = dashboard
  const highest = departments.reduce((best, d) => (d.avgSalary > best.avgSalary ? d : best), departments[0])

  return (
    <div className="settle pt-16 pb-4 sm:pt-24">
      <h1 className="max-w-[20ch] text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] text-ink sm:text-[54px]">
        {fmtInt(totals.activeEmployees)} 人在职，
        <br />
        中位年薪 {fmtMoneyShort(totals.medianSalary)}
      </h1>

      <p className="mt-7 max-w-[54ch] text-[15px] leading-[1.8] text-ink-soft">
        截至 {fmtYearMonth(dashboard.asOf)}，这些人分布在 {fmtInt(totals.departments)} 个部门，
        平均司龄 {totals.avgTenureYears} 年。年薪中位 {fmtMoney(totals.medianSalary)}、平均{' '}
        {fmtMoney(totals.avgSalary)} —— 均值更高，说明少数高薪者把整体拉了上去。给得最多的是{' '}
        {highest?.name}，平均 {fmtMoney(highest?.avgSalary ?? 0)}。
      </p>

      <dl className="mt-12 grid grid-cols-2 gap-y-7 border-t border-rule pt-7 sm:grid-cols-4">
        <HeroFigure label="累计雇员" value={fmtInt(totals.employees)} />
        <HeroFigure label="部门" value={fmtInt(totals.departments)} />
        <HeroFigure label="平均司龄" value={`${totals.avgTenureYears} 年`} />
        <HeroFigure
          label="年薪区间"
          value={`${fmtMoneyShort(totals.minSalary)} – ${fmtMoneyShort(totals.maxSalary)}`}
        />
      </dl>
    </div>
  )
}

function HeroFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-ink-faint">{label}</dt>
      <dd className="mt-1.5 font-mono text-[17px] tabular font-medium text-ink">{value}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 薪酬分布                                                            */
/* ------------------------------------------------------------------ */

function Distribution({ dashboard }: { dashboard: Dashboard }) {
  const { distribution, totals } = dashboard

  const peak = distribution.buckets.reduce(
    (best, bucket) => (bucket.count > best.count ? bucket : best),
    distribution.buckets[0] ?? { from: 0, to: 0, count: 0 },
  )

  return (
    <Section
      title={`大多数人的年薪在 ${fmtMoneyShort(peak.from)}–${fmtMoneyShort(peak.to)}`}
      lede={
        <>
          {fmtInt(totals.activeEmployees)} 名在职员工的当前年薪，按 $5K 一档切开后向右拖出一条长尾。
          一半人的年薪在 {fmtMoney(totals.p25Salary)} 到 {fmtMoney(totals.p75Salary)} 之间，
          均值 {fmtMoney(distribution.mean)} 却高于中位数 {fmtMoney(distribution.median)}{' '}
          —— 差距全在那条尾巴上。
        </>
      }
    >
      <DistributionChart
        buckets={distribution.buckets}
        median={distribution.median}
        mean={distribution.mean}
      />
      <Caption>
        实线中位数 {fmtMoney(distribution.median)} · 虚线均值 {fmtMoney(distribution.mean)}
      </Caption>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 部门：以全员平均为中轴的偏离条                                        */
/* ------------------------------------------------------------------ */

function Departments({ dashboard }: { dashboard: Dashboard }) {
  const { departments, totals } = dashboard

  const bySalary = [...departments].sort((a, b) => b.avgSalary - a.avgSalary)
  const highest = bySalary[0]
  const biggest = departments.reduce((best, d) => (d.headcount > best.headcount ? d : best), departments[0])
  const biggestRank = biggest ? bySalary.findIndex((d) => d.id === biggest.id) + 1 : 0
  const highestRank = highest ? departments.findIndex((d) => d.id === highest.id) + 1 : 0

  return (
    <Section
      title="人多的部门不一定给得多"
      lede={
        <>
          {biggest?.name} 是最大的部门，{fmtInt(biggest?.headcount ?? 0)} 人，平均薪酬只排第{' '}
          {biggestRank || '—'}；{highest?.name} 给得最多（平均 {fmtMoney(highest?.avgSalary ?? 0)}），
          人数却排第 {highestRank || '—'}。高低之间相差{' '}
          {fmtMoney((highest?.avgSalary ?? 0) - (bySalary[bySalary.length - 1]?.avgSalary ?? 0))}。
        </>
      }
    >
      <DepartmentBars departments={departments} average={totals.avgSalary} />
      <Caption>
        以全员平均 {fmtMoney(totals.avgSalary)} 为中轴，右为高于平均、左为低于平均
      </Caption>
    </Section>
  )
}

function DepartmentBars({
  departments,
  average,
}: {
  departments: DepartmentStat[]
  average: number
}) {
  const rows = useMemo(
    () =>
      [...departments]
        .sort((a, b) => b.avgSalary - a.avgSalary)
        .map((dept) => ({
          ...dept,
          delta: dept.avgSalary - average,
        })),
    [departments, average],
  )

  const widest = Math.max(...rows.map((row) => Math.abs(row.delta)), 1)
  const top = rows[0]

  return (
    <div>
      {rows.map((row) => {
        const width = (Math.abs(row.delta) / widest) * 50
        const above = row.delta >= 0
        const isTop = row.id === top?.id
        return (
          <div
            key={row.id}
            className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-4 border-b border-rule/60 py-2.5 last:border-0 sm:grid-cols-[8rem_1fr_6.5rem_5rem]"
          >
            <span className="truncate text-[13.5px] text-ink">{row.name}</span>

            <div className="relative h-[16px]">
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-rule-strong" />
              <span
                className={`absolute top-1/2 h-[16px] -translate-y-1/2 rounded-[1px] ${
                  isTop ? 'bg-accent' : above ? 'bg-ink/70' : 'bg-ink/25'
                }`}
                style={{
                  left: above ? '50%' : `${50 - width}%`,
                  width: `${Math.max(width, 0.8)}%`,
                }}
              />
            </div>

            <span className="text-right font-mono text-[12.5px] tabular text-ink">
              {fmtMoney(row.avgSalary)}
            </span>

            <span className="hidden text-right font-mono text-[11.5px] tabular text-ink-faint sm:block">
              {fmtInt(row.headcount)} 人
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 招聘与留存                                                          */
/* ------------------------------------------------------------------ */

function Hiring({ dashboard }: { dashboard: Dashboard }) {
  const { retention, totals } = dashboard
  const first = retention[0]
  const last = retention[retention.length - 1]
  const drop =
    first && last && first.hired > 0 ? (last.hired - first.hired) / first.hired : 0

  const peak = retention.reduce((best, row) => (row.hired > best.hired ? row : best), retention[0])

  return (
    <Section
      title={`招聘规模 ${first?.year ?? ''}–${last?.year ?? ''} 年缩了 ${fmtPercent(Math.abs(drop), 0)}`}
      lede={
        <>
          {peak?.year} 年前后是招聘高峰，一年入职 {fmtInt(peak?.hired ?? 0)} 人；
          {last?.year} 年只招了 {fmtInt(last?.hired ?? 0)} 人。但进来的人留得住：最早那一批仍有{' '}
          {fmtPercent((first?.active ?? 0) / Math.max(first?.hired ?? 1, 1), 0)} 在职，
          在职员工的平均司龄因此达到 {totals.avgTenureYears} 年。
        </>
      }
    >
      <RetentionChart data={retention} />
      <Caption>
        每行一年，深色为到 {fmtYearMonth(dashboard.asOf)} 仍在职的人，右侧数字为留存率
      </Caption>
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

  // 只看样本足够大的职衔，避免个别小样本把结论带偏。
  const comparable = titles.filter((t) => t.maleAvg > 0 && t.femaleAvg > 0 && t.headcount >= 3000)
  const worstGap = comparable.length
    ? Math.max(...comparable.map((t) => Math.abs((t.femaleAvg - t.maleAvg) / t.maleAvg)))
    : 0

  const topTwo = titles.slice(0, 2)
  const topTwoShare =
    titles.reduce((sum, t) => sum + t.headcount, 0) > 0
      ? topTwo.reduce((sum, t) => sum + t.headcount, 0) /
        titles.reduce((sum, t) => sum + t.headcount, 0)
      : 0

  return (
    <Section
      title="同岗男女薪酬几乎持平"
      lede={
        <>
          {topTwo.length} 个最常见的职衔是 {topTwo[0]?.title} 和 {topTwo[1]?.title}，
          合起来占了 {fmtPercent(topTwoShare, 0)}。全员口径下女性平均比男性低{' '}
          {fmtPercent(Math.abs(overallGap), 1)}，但拆进同一职衔内部，最大差距也只有{' '}
          {fmtPercent(worstGap, 1)} —— 总额上的差异主要来自职衔构成，而不是同岗不同酬。
        </>
      }
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-rule">
            <Th>职衔</Th>
            <Th align="right">人数</Th>
            <Th align="right">平均年薪</Th>
            <Th className="hidden w-[26%] sm:table-cell">最低 – 最高</Th>
            <Th align="right">女性</Th>
          </tr>
        </thead>
        <tbody>
          {titles.map((row) => (
            <tr key={row.title} className="border-b border-rule/60">
              <td className="py-3 pr-4 text-[13.5px] text-ink">{row.title}</td>
              <td className="py-3 pr-4 text-right font-mono text-[12px] tabular text-ink-faint">
                {fmtInt(row.headcount)}
              </td>
              <td className="py-3 pr-4 text-right font-mono text-[12.5px] tabular text-ink">
                {fmtMoney(row.avgSalary)}
              </td>
              <td className="hidden py-3 pr-4 sm:table-cell">
                <RangeBar
                  min={row.minSalary}
                  max={row.maxSalary}
                  median={row.medianSalary}
                  domainMin={domain.min}
                  domainMax={domain.max}
                />
              </td>
              <td className="py-3 text-right font-mono text-[12px] tabular text-ink-faint">
                {fmtPercent(row.femaleShare, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Caption>
        竖线为中位数；女性一列为该职衔内女性占比，整体女性占 {fmtPercent(femaleShare, 0)}
      </Caption>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 薪酬最高的十人                                                       */
/* ------------------------------------------------------------------ */

function TopEarners({ dashboard }: { dashboard: Dashboard }) {
  const { topEarners } = dashboard
  const first = topEarners[0]
  const last = topEarners[topEarners.length - 1]
  const spread =
    first && last && first.salary > 0 ? (first.salary - last.salary) / first.salary : 0

  return (
    <Section
      title="薪酬最高的十人"
      lede={
        first ? (
          <>
            第 1 名 {first.name} 年薪 {fmtMoney(first.salary)}，比第 10 名多{' '}
            {fmtPercent(spread, 0)}。十人里{' '}
            {topEarners.filter((p) => p.title === first.title).length} 人是 {first.title}，
            {topEarners.filter((p) => p.department === first.department).length} 人来自{' '}
            {first.department}。
          </>
        ) : (
          '暂无数据。'
        )
      }
    >
      <ol className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {topEarners.map((person, index) => (
          <li
            key={person.id}
            className="flex items-baseline gap-4 border-b border-rule/60 py-2.5"
          >
            <span className="w-4 shrink-0 font-mono text-[11px] tabular text-ink-faint">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
              {person.name}
              <span className="ml-2 text-[11.5px] text-ink-faint">
                {person.title ?? '—'} · {person.department ?? '—'}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[12.5px] tabular text-ink">
              {fmtMoney(person.salary)}
            </span>
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
    <Section title="查一个人" lede="按工号精确查，或按姓 / 名的片段模糊查。">
      <div className="relative max-w-[420px]">
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="工号、姓或名"
          className="w-full border-b border-rule-strong bg-transparent py-2.5 pr-8 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-ink"
        />
        {term ? (
          <button
            type="button"
            aria-label="清空"
            onClick={() => {
              setTerm('')
              inputRef.current?.focus()
            }}
            className="absolute top-1/2 right-1 -translate-y-1/2 px-1 text-[15px] leading-none text-ink-faint transition hover:text-ink"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="mt-6">
        {state === 'idle' ? null : state === 'loading' ? (
          <p className="text-[12.5px] text-ink-faint">查询中…</p>
        ) : error ? (
          <p className="text-[12.5px] text-ink-faint">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] text-ink-faint">没有匹配的人。</p>
        ) : (
          <>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
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
                  <tr key={row.id} className="border-b border-rule/60">
                    <td className="py-2.5 pr-4 font-mono text-[11.5px] tabular text-ink-faint">
                      {row.id}
                    </td>
                    <td className="py-2.5 pr-4 text-[13px] text-ink">{row.name}</td>
                    <td className="hidden py-2.5 pr-4 text-[12.5px] text-ink-soft sm:table-cell">
                      {row.title ?? '—'}
                    </td>
                    <td className="hidden py-2.5 pr-4 text-[12.5px] text-ink-soft sm:table-cell">
                      {row.department ?? '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-[12.5px] tabular text-ink">
                      {row.salary === null ? '—' : fmtMoney(row.salary)}
                    </td>
                    <td className="hidden py-2.5 text-right font-mono text-[11.5px] tabular text-ink-faint sm:table-cell">
                      {fmtDate(row.hireDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {truncated ? (
              <p className="mt-3 text-[11.5px] text-ink-faint">
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
      className={`pb-2.5 text-[11.5px] font-normal text-ink-faint ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  )
}

function Unavailable({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="pt-24">
      <h1 className="text-[24px] font-semibold tracking-tight text-ink">没能加载到员工数据</h1>
      <p className="mt-3 max-w-[48ch] text-[13.5px] leading-relaxed text-ink-soft">
        这通常是暂时的。重试一次；如果仍然不行，稍后再来。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 border-b border-ink pb-1 text-[13px] text-ink transition hover:opacity-60"
      >
        重试
      </button>
      {error ? (
        <details className="mt-10 max-w-xl">
          <summary className="cursor-pointer text-[11.5px] text-ink-faint">技术细节</summary>
          <p className="mt-2 font-mono text-[11px] leading-relaxed break-words text-ink-faint">
            {error}
          </p>
        </details>
      ) : null}
    </div>
  )
}
