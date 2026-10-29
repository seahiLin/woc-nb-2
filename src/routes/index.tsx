import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { findEmployees, getDashboard } from '../lib/dashboard.functions'
import type { Dashboard, EmployeeRow } from '../lib/dashboard-types'
import {
  DepartmentDeviation,
  EarnersLadder,
  GenderGap,
  HiringTimeline,
  SalaryDistribution,
  TitleRanges,
  fmtDate,
  fmtInt,
  fmtMoney,
  fmtMoneyShort,
  fmtPercent,
  fmtYearMonth,
} from '../components/charts'
import { BigNumber, Chapter, Figure, MethodNote, Prose } from '../components/story'

export const Route = createFileRoute('/')({
  loader: () => getDashboard({ data: { force: false } }),
  component: Report,
})

function Report() {
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
    <div className="mx-auto max-w-[1060px] px-5 pb-32 sm:px-8">
      <Masthead dashboard={dashboard} refreshing={refreshing} onRefresh={refresh} />

      {dashboard ? <Article dashboard={dashboard} /> : <Unavailable error={result.error} onRetry={refresh} />}
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
    <header className="flex items-baseline justify-between gap-4 border-b border-ink py-4">
      <p className="text-[15px] font-medium">员工与薪酬</p>
      <div className="flex items-baseline gap-5">
        <p className="font-sans text-[11.5px] tabular-nums text-ink-faint">
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
/* 全文                                                                */
/* ------------------------------------------------------------------ */

function Article({ dashboard }: { dashboard: Dashboard }) {
  return (
    <article>
      <Cover dashboard={dashboard} />
      <Hiring dashboard={dashboard} />
      <BigNumber
        value={fmtPercent(1 - dashboard.totals.activeEmployees / Math.max(dashboard.totals.employees, 1))}
        caption={
          <>
            登记册上出现过 {fmtInt(dashboard.totals.employees)} 个人，到{' '}
            {fmtYearMonth(dashboard.asOf)} 还在职的只有{' '}
            {fmtInt(dashboard.totals.activeEmployees)} 人。上一张图算的是招进来，
            往下每张图算的都是留下的这一批。
          </>
        }
      />
      <Departments dashboard={dashboard} />
      <Titles dashboard={dashboard} />
      <Gender dashboard={dashboard} />
      <TopEarners dashboard={dashboard} />
      <Lookup />
      <MethodNote>
        <p>在职：截至 {fmtDate(dashboard.asOf)} 仍有当前有效的部门任职记录。</p>
        <p>当前有效：任职、职级或薪资的结束日为 9999-01-01 视为仍在生效。</p>
        <p>年薪：只取当前有效的薪资记录，单位为美元，未做通胀调整。</p>
        <p>中位数与四分位：在全部当前薪资上直接取分位点，不分组加权。</p>
        <p>分档：$5,000 一档，$120,000 以上并入最后一档。</p>
        <p>检索：工号精确匹配，姓名按片段匹配，最多列出 25 条。</p>
      </MethodNote>
      <footer className="mt-10 border-t border-rule pt-5 font-sans text-[11.5px] leading-relaxed text-ink-faint">
        {fmtInt(dashboard.totals.employees)} 条入职记录，数据截至 {fmtDate(dashboard.asOf)}。
      </footer>
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* 封面：标题就是结论，标题下面直接是图                                  */
/* ------------------------------------------------------------------ */

function Cover({ dashboard }: { dashboard: Dashboard }) {
  const { totals, distribution } = dashboard

  return (
    <div className="pt-14 sm:pt-20">
      <h1 className="mx-auto max-w-[34rem] text-[34px] leading-[1.22] font-medium tracking-[-0.02em] text-balance sm:text-[46px]">
        一半的工资单，落在 {fmtMoneyShort(totals.p25Salary)} 到 {fmtMoneyShort(totals.p75Salary)}{' '}
        之间
      </h1>
      <p className="mx-auto mt-5 max-w-[34rem] text-[16.5px] leading-[1.8] text-ink-soft">
        按 $5,000 一档排开，$120,000 以上并入最后一档。
      </p>

      <Figure
        note={
          <>
            最贵的一份是 {fmtMoney(totals.maxSalary)}，最便宜的 {fmtMoney(totals.minSalary)}；
            平均 {fmtMoney(totals.avgSalary)}，比中位数高{' '}
            {fmtMoney(totals.avgSalary - totals.medianSalary)}。
          </>
        }
      >
        <SalaryDistribution
          buckets={distribution.buckets}
          median={distribution.median}
          p25={totals.p25Salary}
          p75={totals.p75Salary}
        />
      </Figure>

      <div className="mt-16 sm:mt-20">
        <Prose lead>
          这份登记册记的是一家公司 {dashboard.retention[0]?.year} 到{' '}
          {dashboard.retention[dashboard.retention.length - 1]?.year} 年间的每一次入职、每一次调薪、
          每一次换岗。下面几张图都停在同一天，读的是同一批人。
        </Prose>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 招聘：一条滚动的年份轴                                                */
/* ------------------------------------------------------------------ */

function Hiring({ dashboard }: { dashboard: Dashboard }) {
  const { retention } = dashboard
  const first = retention[0]
  const last = retention[retention.length - 1]
  const peak = retention.reduce((best, row) => (row.hired > best.hired ? row : best), retention[0])

  const rate = (row: { hired: number; active: number } | undefined) =>
    row && row.hired > 0 ? row.active / row.hired : 0

  return (
    <Chapter
      title={
        <>
          {peak?.year} 年一年招了 {fmtInt(peak?.hired ?? 0)} 人；{last?.year} 年只有{' '}
          {fmtInt(last?.hired ?? 0)} 人
        </>
      }
    >
      <Prose>
        {first?.year} 年入职的那一批，到今天还有 {fmtPercent(rate(first))} 在职；{peak?.year}{' '}
        年招得最多，留下 {fmtPercent(rate(peak))}。越靠右的年份越不完整——登记册停在{' '}
        {fmtYearMonth(dashboard.asOf)}，{last?.year} 年只记了 {fmtInt(last?.hired)} 个人入职。
      </Prose>
      <Figure note="浅色是当年招进的人数，深色是其中至今仍在职的人数。">
        <HiringTimeline data={retention} />
      </Figure>
    </Chapter>
  )
}

/* ------------------------------------------------------------------ */
/* 部门：以全员平均为中轴的偏离                                          */
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
    (best, row) => (row.headcount > best.headcount ? row : best),
    departments[0],
  )
  const biggestRank = biggest ? bySalary.findIndex((row) => row.id === biggest.id) + 1 : 0

  return (
    <Chapter
      title={
        <>
          {highest?.name} 的平均年薪比 {lowest?.name} 多{' '}
          {fmtMoneyShort((highest?.avgSalary ?? 0) - (lowest?.avgSalary ?? 0))}
        </>
      }
    >
      <Prose>
        给得最多的 {highest?.name} 人数只排第{' '}
        {bySalary.length - bySalary.findIndex((row) => row.id === highest?.id)}；人最多的{' '}
        {biggest?.name}（{fmtInt(biggest?.headcount ?? 0)} 人）平均年薪排第 {biggestRank}。
        部门大小和给钱多少，基本是两件事。
      </Prose>
      <Figure
        note={
          highest ? (
            <>
              {highest.name} 内部最低 {fmtMoney(highest.minSalary)}，最高{' '}
              {fmtMoney(highest.maxSalary)}——一个部门内部的差距，比部门之间还大。
            </>
          ) : null
        }
      >
        <DepartmentDeviation rows={bySalary} average={totals.avgSalary} />
      </Figure>
    </Chapter>
  )
}

/* ------------------------------------------------------------------ */
/* 职衔：同一个头衔内部的跨度                                            */
/* ------------------------------------------------------------------ */

function Titles({ dashboard }: { dashboard: Dashboard }) {
  const { titles } = dashboard
  const top = titles[0]
  const ratio = top && top.minSalary > 0 ? top.maxSalary / top.minSalary : 0

  return (
    <Chapter
      title={
        <>
          同样是 {top?.title}，最高的一份是最低的 {fmtInt(Math.round(ratio))} 倍
        </>
      }
    >
      <Prose>
        {fmtInt(top?.headcount ?? 0)} 名 {top?.title} 里，最低 {fmtMoney(top?.minSalary ?? 0)}，
        最高 {fmtMoney(top?.maxSalary ?? 0)}，中位数 {fmtMoney(top?.medianSalary ?? 0)}。
        {titles.length} 个职衔之间的高低，远不如同一个职衔内部的资历差别说得清薪水。
      </Prose>
      <Figure note="每条线的两端是该职衔的最低与最高年薪，红线是中位数。">
        <TitleRanges titles={titles} />
      </Figure>
    </Chapter>
  )
}

/* ------------------------------------------------------------------ */
/* 性别：整体差与同岗差                                                  */
/* ------------------------------------------------------------------ */

function Gender({ dashboard }: { dashboard: Dashboard }) {
  const { gender, titles } = dashboard

  const overallGap =
    gender.male.avgSalary > 0
      ? (gender.female.avgSalary - gender.male.avgSalary) / gender.male.avgSalary
      : 0

  // 只看样本足够大的职衔，免得几个人的 Manager 把结论带偏。
  const comparable = useMemo(
    () =>
      titles
        .filter((row) => row.maleAvg > 0 && row.femaleAvg > 0 && row.headcount >= 3000)
        .map((row) => ({
          title: row.title,
          headcount: row.headcount,
          maleAvg: row.maleAvg,
          femaleAvg: row.femaleAvg,
          gap: (row.femaleAvg - row.maleAvg) / row.maleAvg,
        }))
        .sort((a, b) => a.gap - b.gap),
    [titles],
  )

  const worst = comparable[0]
  const narrowest = comparable[comparable.length - 1]

  return (
    <Chapter
      title={
        <>
          女性平均年薪少 {fmtPercent(Math.abs(overallGap), 1)}；拆到同一个职衔里，最多少{' '}
          {fmtPercent(Math.abs(worst?.gap ?? 0), 1)}
        </>
      }
    >
      <Prose>
        女性 {fmtInt(gender.female.headcount)} 人平均 {fmtMoney(gender.female.avgSalary)}，
        男性 {fmtInt(gender.male.headcount)} 人平均 {fmtMoney(gender.male.avgSalary)}。
        差距最大的是 {worst?.title}：女性 {fmtMoney(worst?.femaleAvg ?? 0)}，男性{' '}
        {fmtMoney(worst?.maleAvg ?? 0)}；最小的是 {narrowest?.title}，
        {fmtPercent(Math.abs(narrowest?.gap ?? 0), 1)}。
      </Prose>

      <Figure note={`只列在职人数超过 3,000 的 ${comparable.length} 个职衔，样本太小的不算。最后一行是全体在职。`}>
        <GenderGap
          rows={comparable}
          overall={{ label: '全体在职', gap: overallGap }}
        />
      </Figure>
    </Chapter>
  )
}

/* ------------------------------------------------------------------ */
/* 最高薪                                                              */
/* ------------------------------------------------------------------ */

function TopEarners({ dashboard }: { dashboard: Dashboard }) {
  const { topEarners, totals } = dashboard
  const first = topEarners[0]
  const last = topEarners[topEarners.length - 1]

  // 十人往往同职衔同部门，那就说一次，不必每行重复。
  const uniform =
    topEarners.length > 0 &&
    topEarners.every((person) => person.title === first?.title && person.department === first?.department)
  const titleCount = new Set(topEarners.map((person) => person.title)).size

  return (
    <Chapter
      title={
        uniform ? (
          <>最贵的十个人，全是 {first?.title}</>
        ) : (
          <>最贵的十个人，来自 {titleCount} 个职衔</>
        )
      }
    >
      <Prose>
        第 1 名 {first?.name} 年薪 {fmtMoney(first?.salary ?? 0)}，比第 10 名多{' '}
        {fmtMoney((first?.salary ?? 0) - (last?.salary ?? 0))}，是全体中位数的{' '}
        {((first?.salary ?? 0) / Math.max(totals.medianSalary, 1)).toFixed(1)} 倍。
        {uniform ? <> 十个人都在 {first?.department}。</> : null}
      </Prose>
      <Figure note="每人一条，线的长度是他的年薪，红线是全体中位数。">
        <EarnersLadder people={topEarners} median={totals.medianSalary} />
      </Figure>
    </Chapter>
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
    <Chapter title={<>以上都是平均，这里可以查具体一个人</>}>
      <Prose>输入工号，或者姓名里的一段，比如一个姓。</Prose>

      <div className="mx-auto mt-8 max-w-[34rem]">
        <div className="relative">
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="工号、姓或名"
            aria-label="按工号、姓或名查员工"
            className="w-full border-b border-rule-strong bg-transparent py-2 pr-7 text-[16px] outline-none transition placeholder:text-ink-faint focus:border-ink"
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

        <div className="mt-6">
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
                      <td className="py-2 pr-4 font-sans text-[11.5px] tabular-nums text-ink-faint">
                        {row.id}
                      </td>
                      <td className="py-2 pr-4 text-[15px]">{row.name}</td>
                      <td className="hidden py-2 pr-4 text-[13.5px] text-ink-soft sm:table-cell">
                        {row.title ?? '—'}
                      </td>
                      <td className="hidden py-2 pr-4 text-[13.5px] text-ink-soft sm:table-cell">
                        {row.department ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-right text-[14px] tabular-nums">
                        {row.salary === null ? '—' : fmtMoney(row.salary)}
                      </td>
                      <td className="hidden py-2 text-right font-sans text-[11.5px] tabular-nums text-ink-faint sm:table-cell">
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
      </div>
    </Chapter>
  )
}

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
      <h1 className="text-[26px] font-medium">读不到员工数据</h1>
      <p className="mt-3 max-w-[34rem] text-[16.5px] leading-[1.8] text-ink-soft">
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
