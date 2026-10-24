import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { findEmployees, getDashboard, pingNeonFn } from '../lib/dashboard.functions'
import type { Dashboard, EmployeeRow } from '../lib/dashboard-types'
import {
  DistributionChart,
  Legend,
  RangeBar,
  RetentionChart,
  Section,
  TrendChart,
  fmtCompact,
  fmtDate,
  fmtDelta,
  fmtInt,
  fmtMoney,
  fmtMoneyShort,
  fmtPercent,
  fmtYearMonth,
} from '../components/charts'

export const Route = createFileRoute('/')({
  loader: () => getDashboard(),
  component: DashboardPage,
})

function DashboardPage() {
  const initial = Route.useLoaderData()
  const fetchDashboard = useServerFn(getDashboard)
  const fetchEmployees = useServerFn(findEmployees)
  const checkNeon = useServerFn(pingNeonFn)

  const [result, setResult] = useState(initial)
  const [refreshing, setRefreshing] = useState(false)

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

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-[1180px] px-5 pb-20 sm:px-8">
        <Masthead
          dashboard={dashboard}
          live={result.live}
          error={result.error}
          refreshing={refreshing}
          onRefresh={refresh}
          onPing={ping}
        />

        {dashboard ? (
          <Report dashboard={dashboard} />
        ) : (
          <Unavailable error={result.error} onRetry={ping} />
        )}

        <SearchPanel />

        <footer className="mt-14 border-t border-rule pt-5">
          <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-ink-faint sm:flex-row sm:items-baseline sm:justify-between">
            <p>
              数据源 Neon Postgres · <code className="font-mono text-ink-soft">neondb</code> /{' '}
              <code className="font-mono text-ink-soft">employees</code> schema · 六张表
              employee / department / department_employee / department_manager / salary / title
            </p>
            <p className="shrink-0 font-mono">
              {dashboard ? `查询于 ${fmtDate(dashboard.generatedAt)}` : '未连接'}
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 报头                                                                */
/* ------------------------------------------------------------------ */

function Masthead({
  dashboard,
  live,
  error,
  refreshing,
  onRefresh,
  onPing,
}: {
  dashboard: Dashboard | null
  live: boolean
  error: string | null
  refreshing: boolean
  onRefresh: () => void
  onPing: () => void
}) {
  const status = live ? 'live' : error ? 'error' : 'cache'
  const statusCopy = {
    live: { label: 'Neon 实时', color: 'bg-live', text: 'text-live' },
    cache: { label: 'D1 缓存快照', color: 'bg-warn', text: 'text-warn' },
    error: { label: '连接异常', color: 'bg-danger', text: 'text-danger' },
  }[status]

  return (
    <header className="pt-10 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <span className="font-mono text-[10.5px] tracking-[0.24em] text-ink-faint uppercase">
          People Analytics · Employees Dataset
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className={`h-1.5 w-1.5 rounded-full ${statusCopy.color}`} />
            <span className={statusCopy.text}>{statusCopy.label}</span>
          </span>
          <span className="h-3 w-px bg-rule-strong" />
          <button
            type="button"
            onClick={onPing}
            disabled={refreshing}
            className="text-[11px] text-ink-soft underline-offset-2 transition hover:text-ink hover:underline disabled:opacity-40"
          >
            测试连接
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="text-[11px] text-ink-soft underline-offset-2 transition hover:text-ink hover:underline disabled:opacity-40"
          >
            {refreshing ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-[42px]">
            谁在这家公司，
            <br className="sm:hidden" />
            拿多少钱
          </h1>
          <p className="mt-3 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">
            {dashboard ? (
              <>
                一个跨越 {dashboard.totals.firstHire.slice(0, 4)}–{dashboard.totals.lastHire.slice(0, 4)}{' '}
                年的员工数据集：{fmtInt(dashboard.totals.employees)} 人曾在这里工作，其中{' '}
                {fmtInt(dashboard.totals.activeEmployees)} 人在 {fmtYearMonth(dashboard.asOf)} 这个时点仍在职。
                以下是关于规模、薪酬、流动与结构的全部要点。
              </>
            ) : (
              <>正在读取 Neon 上的 employees 数据集。</>
            )}
          </p>
        </div>

        {dashboard ? (
          <dl className="flex shrink-0 gap-8 sm:gap-10">
            <div>
              <dt className="font-mono text-[10px] tracking-[0.16em] text-ink-faint uppercase">基准日</dt>
              <dd className="mt-1 font-mono text-[15px] tabular text-ink">{dashboard.asOf}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.16em] text-ink-faint uppercase">库</dt>
              <dd className="mt-1 font-mono text-[15px] text-ink">{dashboard.database}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* 报告主体                                                            */
/* ------------------------------------------------------------------ */

function Report({ dashboard }: { dashboard: Dashboard }) {
  const { totals, distribution, retention, departments, titles, gender, salaryTrend, topEarners } =
    dashboard

  const headcountShare = totals.employees > 0 ? totals.activeEmployees / totals.employees : 0

  // 薪资分布的“跨度”用来画部门/职衔的区间条，统一同一把尺子。
  const salaryDomain = useMemo(() => {
    const mins = [...departments.map((d) => d.minSalary), ...titles.map((t) => t.minSalary)].filter(
      (v) => v > 0,
    )
    const maxs = [...departments.map((d) => d.maxSalary), ...titles.map((t) => t.maxSalary)].filter(
      (v) => v > 0,
    )
    return {
      min: mins.length ? Math.min(...mins) : 0,
      max: maxs.length ? Math.max(...maxs) : 1,
    }
  }, [departments, titles])

  // 各部门薪酬相对公司均值的溢价/折价
  const deptPremium = (avg: number) =>
    totals.avgSalary > 0 ? (avg - totals.avgSalary) / totals.avgSalary : 0

  // 同岗男女差异（取样本量最大的几个职衔）
  const genderGap = titles
    .filter((t) => t.maleAvg > 0 && t.femaleAvg > 0 && t.headcount >= 3000)
    .map((t) => ({
      title: t.title,
      gap: (t.femaleAvg - t.maleAvg) / t.maleAvg,
      maleAvg: t.maleAvg,
      femaleAvg: t.femaleAvg,
      headcount: t.headcount,
    }))

  const retentionPeak = retention.reduce(
    (best, r) => (r.hired > best.hired ? r : best),
    retention[0] ?? { year: 0, hired: 0, active: 0 },
  )
  const retentionWorst = retention.reduce(
    (worst, r) => (r.hired < worst.hired ? r : worst),
    retention[0] ?? { year: 0, hired: 0, active: 0 },
  )

  const trendGrowth =
    salaryTrend.length > 1 && salaryTrend[0].avgSalary > 0
      ? (salaryTrend[salaryTrend.length - 1].avgSalary - salaryTrend[0].avgSalary) /
        salaryTrend[0].avgSalary
      : 0

  const highestDept = departments.reduce(
    (best, d) => (d.avgSalary > best.avgSalary ? d : best),
    departments[0] ?? {
      id: '',
      name: '',
      headcount: 0,
      share: 0,
      avgSalary: 0,
      medianSalary: 0,
      minSalary: 0,
      maxSalary: 0,
      femaleShare: 0,
      manager: null,
    },
  )

  const femaleShareTotal =
    gender.male.headcount + gender.female.headcount > 0
      ? gender.female.headcount / (gender.male.headcount + gender.female.headcount)
      : 0

  const overallGap =
    gender.male.avgSalary > 0
      ? (gender.female.avgSalary - gender.male.avgSalary) / gender.male.avgSalary
      : 0

  /** 分布最高的一档，导语里要引用它的区间。 */
  const peakBucket = distribution.buckets.reduce(
    (best, bucket) => (bucket.count > best.count ? bucket : best),
    distribution.buckets[0] ?? { from: 0, to: 0, count: 0 },
  )

  return (
    <div className="space-y-14">
      {/* ---------------------------------------------------------- */}
      {/* 01 概览                                                     */}
      {/* ---------------------------------------------------------- */}
      <Section
        index="01"
        title="规模与薪酬总览"
        lede={
          <>
            公司当前有 {fmtInt(totals.activeEmployees)} 名在职员工，平均年薪{' '}
            <strong className="font-semibold text-ink">{fmtMoney(totals.avgSalary)}</strong>
            ，中位数 {fmtMoney(totals.medianSalary)}。半数人落在{' '}
            {fmtMoney(totals.p25Salary)} – {fmtMoney(totals.p75Salary)} 之间。
          </>
        }
        aside={`${fmtInt(totals.salaryRecords)} 条薪资记录`}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-7 border-y border-rule py-7 sm:grid-cols-4">
          <Stat
            label="在职员工"
            value={fmtInt(totals.activeEmployees)}
            note={`占历史总人数 ${fmtPercent(headcountShare, 0)}`}
          />
          <Stat
            label="平均年薪"
            value={fmtMoney(totals.avgSalary)}
            note={`中位数 ${fmtMoney(totals.medianSalary)}`}
          />
          <Stat
            label="平均司龄"
            value={`${totals.avgTenureYears} 年`}
            note={`以 ${fmtYearMonth(dashboard.asOf)} 为基准`}
          />
          <Stat
            label="部门"
            value={fmtInt(totals.departments)}
            note={`${fmtInt(totals.managerRecords)} 条经理任职记录`}
          />
        </div>

        <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-3">
          <Fact
            term="薪酬跨度"
            detail={`从 ${fmtMoneyShort(totals.minSalary)} 到 ${fmtMoneyShort(totals.maxSalary)}，最高与最低相差 ${(
              totals.maxSalary / Math.max(totals.minSalary, 1)
            ).toFixed(1)} 倍。`}
          />
          <Fact
            term="薪资通胀"
            detail={`${salaryTrend[0]?.year ?? '—'} 年到 ${salaryTrend[salaryTrend.length - 1]?.year ?? '—'} 年，平均薪资累计上涨 ${fmtPercent(
              trendGrowth,
              0,
            )}。`}
          />
          <Fact
            term="薪酬最高的部门"
            detail={`${highestDept.name}，平均 ${fmtMoney(highestDept.avgSalary)}，比公司均值高 ${fmtPercent(
              deptPremium(highestDept.avgSalary),
              0,
            )}。`}
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------- */}
      {/* 02 薪酬分布                                                 */}
      {/* ---------------------------------------------------------- */}
      <Section
        index="02"
        title="薪酬分布"
        lede={
          <>
            把 {fmtInt(totals.activeEmployees)} 名在职员工的当前年薪按 $5K 一档切分。分布明显右偏：
            众数在 {fmtMoneyShort(peakBucket.from)} 一带，但均值（{fmtMoney(distribution.mean)}）
            被少数高薪者拉高到中位数（{fmtMoney(distribution.median)}）之上。
          </>
        }
        aside={
          <Legend
            items={[
              { label: '中位数', color: '#c2410c' },
              { label: '均值', color: '#1d4ed8' },
            ]}
          />
        }
      >
        <div className="rounded-sm border border-rule bg-paper-raised px-5 pt-4 pb-2">
          <DistributionChart
            buckets={distribution.buckets}
            median={distribution.median}
            mean={distribution.mean}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MiniStat label="P25" value={fmtMoney(totals.p25Salary)} />
          <MiniStat label="中位数" value={fmtMoney(totals.medianSalary)} accent />
          <MiniStat label="均值" value={fmtMoney(totals.avgSalary)} />
          <MiniStat label="P75" value={fmtMoney(totals.p75Salary)} />
        </div>
      </Section>

      {/* ---------------------------------------------------------- */}
      {/* 03 招聘与留存                                                */}
      {/* ---------------------------------------------------------- */}
      <Section
        index="03"
        title="招聘节奏与留存"
        lede={
          <>
            招聘规模逐年下降：{retentionPeak.year} 年招了 {fmtInt(retentionPeak.hired)} 人，
            {retentionWorst.year} 年只有 {fmtInt(retentionWorst.hired)} 人。深色段是当年入职者中至今仍在职的比例 ——
            大部分年份稳定在八成左右。
          </>
        }
        aside={<Legend items={[{ label: '在职', color: '#16181d' }, { label: '已离开', color: '#d5d1ca' }]} />}
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.35fr_1fr]">
          <div className="rounded-sm border border-rule bg-paper-raised px-5 py-5">
            <RetentionChart data={retention} />
          </div>
          <div className="space-y-5">
            <Fact
              term="最早一批人"
              detail={`${retentionPeak.year} 年入职的 ${fmtInt(retentionPeak.hired)} 人中，仍有 ${fmtInt(
                retentionPeak.active,
              )} 人在职（${fmtPercent(retentionPeak.active / Math.max(retentionPeak.hired, 1), 0)}）。`}
            />
            <Fact
              term="最近一批人"
              detail={`${retentionWorst.year} 年仅 ${fmtInt(retentionWorst.hired)} 人入职，留存率反而降到 ${fmtPercent(
                retentionWorst.active / Math.max(retentionWorst.hired, 1),
                0,
              )}。`}
            />
            <Fact
              term="平均司龄"
              detail={`在职员工平均已工作 ${totals.avgTenureYears} 年，招聘窗口在 ${retention[retention.length - 1]?.year ?? '—'} 年基本关闭 —— 这是一份“停止招人”的组织快照。`}
            />
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- */}
      {/* 04 部门                                                     */}
      {/* ---------------------------------------------------------- */}
      <Section
        index="04"
        title="部门画像"
        lede={
          <>
            九个部门的人数差距很大：{departments[0]?.name} 有 {fmtInt(departments[0]?.headcount ?? 0)} 人，
            {departments[departments.length - 1]?.name} 只有 {fmtInt(departments[departments.length - 1]?.headcount ?? 0)} 人。
            但薪酬高低和人数多少几乎无关 —— 薪酬最高的 Sales 人数只排第三，第二的 Marketing 排第六。
          </>
        }
        aside="薪酬条为最低–最高区间，竖线为中位数"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-rule-strong">
                <Th>部门</Th>
                <Th align="right">人数</Th>
                <Th align="right">占比</Th>
                <Th align="right">平均年薪</Th>
                <Th align="right">vs 均值</Th>
                <Th className="w-[180px]">薪酬区间</Th>
                <Th align="right">女性</Th>
                <Th>经理</Th>
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => {
                const premium = deptPremium(dept.avgSalary)
                return (
                  <tr key={dept.id} className="border-b border-rule/70 transition-colors hover:bg-ink/[0.02]">
                    <td className="py-3 pr-4">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[10px] text-ink-faint">{dept.id}</span>
                        <span className="text-[13.5px] font-medium text-ink">{dept.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-[12.5px] tabular text-ink">
                      {fmtInt(dept.headcount)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-[12.5px] tabular text-ink-faint">
                      {fmtPercent(dept.share, 1)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-[12.5px] tabular text-ink">
                      {fmtMoney(dept.avgSalary)}
                    </td>
                    <td
                      className={`py-3 pr-4 text-right font-mono text-[12.5px] tabular ${
                        premium >= 0.05 ? 'text-accent' : 'text-ink-faint'
                      }`}
                    >
                      {fmtDelta(premium, 0)}
                    </td>
                    <td className="py-3 pr-4">
                      <RangeBar
                        min={dept.minSalary}
                        max={dept.maxSalary}
                        median={dept.medianSalary}
                        domainMin={salaryDomain.min}
                        domainMax={salaryDomain.max}
                      />
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-[12.5px] tabular text-ink-faint">
                      {fmtPercent(dept.femaleShare, 0)}
                    </td>
                    <td className="py-3 text-[12px] text-ink-soft">
                      {dept.manager ? (
                        <span className="flex flex-col leading-tight">
                          <span className="text-ink">{dept.manager.name}</span>
                          <span className="font-mono text-[10px] text-ink-faint">
                            {fmtYearMonth(dept.manager.since)} 起 · {fmtMoneyShort(dept.manager.salary)}
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---------------------------------------------------------- */}
      {/* 05 职衔与性别                                                */}
      {/* ---------------------------------------------------------- */}
      <Section
        index="05"
        title="职衔结构与同岗薪酬差异"
        lede={
          <>
            七个职衔里，{titles[0]?.title} 和 {titles[1]?.title} 就占了{' '}
            {fmtPercent(
              ((titles[0]?.headcount ?? 0) + (titles[1]?.headcount ?? 0)) /
                Math.max(titles.reduce((s, t) => s + t.headcount, 0), 1),
              0,
            )}
            。整体女性占 {fmtPercent(femaleShareTotal, 0)}，而在每个职衔内部，男女平均薪酬的差距都在 1% 以内（
            Manager 除外，只有 9 人）—— 这份数据里几乎没有同岗性别薪酬差。
          </>
        }
        aside="右侧为同一职衔内 女性均值 − 男性均值"
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule-strong">
                  <Th>职衔</Th>
                  <Th align="right">人数</Th>
                  <Th align="right">平均年薪</Th>
                  <Th className="w-[140px]">区间</Th>
                  <Th align="right">女性</Th>
                </tr>
              </thead>
              <tbody>
                {titles.map((title) => (
                  <tr key={title.title} className="border-b border-rule/70">
                    <td className="py-2.5 pr-4 text-[13px] text-ink">{title.title}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-[12px] tabular text-ink-soft">
                      {fmtInt(title.headcount)}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-[12px] tabular text-ink">
                      {fmtMoney(title.avgSalary)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <RangeBar
                        min={title.minSalary}
                        max={title.maxSalary}
                        median={title.medianSalary}
                        domainMin={salaryDomain.min}
                        domainMax={salaryDomain.max}
                      />
                    </td>
                    <td className="py-2.5 text-right font-mono text-[12px] tabular text-ink-faint">
                      {fmtPercent(title.femaleShare, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-4">
            <h3 className="font-mono text-[10px] tracking-[0.16em] text-ink-faint uppercase">
              同岗性别差异
            </h3>
            {genderGap.map((row) => (
              <div key={row.title}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] text-ink">{row.title}</span>
                  <span
                    className={`font-mono text-[12px] tabular ${
                      Math.abs(row.gap) < 0.01 ? 'text-ink-faint' : 'text-accent'
                    }`}
                  >
                    {fmtDelta(row.gap, 1)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[10.5px] tabular text-ink-faint">
                  <span>男 {fmtMoneyShort(row.maleAvg)}</span>
                  <span className="h-px flex-1 bg-rule" />
                  <span>女 {fmtMoneyShort(row.femaleAvg)}</span>
                </div>
              </div>
            ))}
            <div className="border-t border-rule pt-3">
              <p className="text-[12px] leading-relaxed text-ink-soft">
                全员口径下女性平均 {fmtMoney(gender.female.avgSalary)}、男性{' '}
                {fmtMoney(gender.male.avgSalary)}，差异 {fmtDelta(overallGap, 1)}。
                把职衔拆开看，差异进一步收窄 —— 说明总额差异主要来自职衔构成，而非同岗差别。
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- */}
      {/* 06 薪酬趋势                                                  */}
      {/* ---------------------------------------------------------- */}
      <Section
        index="06"
        title="薪酬水平随年份"
        lede={
          <>
            按薪资生效年份汇总的历史平均薪资，{salaryTrend[0]?.year} 年为{' '}
            {fmtMoney(salaryTrend[0]?.avgSalary ?? 0)}，到 {salaryTrend[salaryTrend.length - 1]?.year} 年升至{' '}
            {fmtMoney(salaryTrend[salaryTrend.length - 1]?.avgSalary ?? 0)}，累计上涨{' '}
            {fmtPercent(trendGrowth, 0)}，年均约 {fmtPercent(
              Math.pow(1 + trendGrowth, 1 / Math.max(salaryTrend.length - 1, 1)) - 1,
              1,
            )}。
          </>
        }
        aside="每个点是一次薪资调整后的全员均值"
      >
        <div className="rounded-sm border border-rule bg-paper-raised px-5 pt-4 pb-2">
          <TrendChart points={salaryTrend} />
        </div>
      </Section>

      {/* ---------------------------------------------------------- */}
      {/* 07 薪酬最高                                                  */}
      {/* ---------------------------------------------------------- */}
      <Section
        index="07"
        title="当前薪酬最高的十人"
        lede={
          <>
            名单高度集中在 {topEarners[0]?.department ?? '—'} 与{' '}
            {topEarners[0]?.title ?? '—'} 这两类岗位上。第 1 名与第 10 名之间的差距为{' '}
            {fmtPercent(
              ((topEarners[0]?.salary ?? 0) - (topEarners[topEarners.length - 1]?.salary ?? 0)) /
                Math.max(topEarners[0]?.salary ?? 1, 1),
              0,
            )}
            。
          </>
        }
        aside={`共 ${topEarners.length} 人`}
      >
        <ol className="divide-y divide-rule">
          {topEarners.map((person, index) => (
            <li key={person.id} className="flex items-center gap-4 py-3">
              <span className="w-5 shrink-0 font-mono text-[11px] tabular text-ink-faint">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{person.name}</p>
                <p className="truncate text-[11.5px] text-ink-soft">
                  {person.title ?? '—'} · {person.department ?? '—'} · {person.hireDate.slice(0, 4)} 年入职
                </p>
              </div>
              <span className="shrink-0 font-mono text-[13.5px] tabular font-medium text-ink">
                {fmtMoney(person.salary)}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---------------------------------------------------------- */}
      {/* 08 数据字典                                                  */}
      {/* ---------------------------------------------------------- */}
      <Section
        index="08"
        title="数据字典"
        lede="以上所有指标都由这六张表算出。口径统一：to_date = 9999-01-01 视为“当前有效”。"
      >
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
          {[
            { name: 'employee', rows: totals.employees, desc: '员工主表 · 姓名 / 性别 / 入职日' },
            { name: 'department', rows: totals.departments, desc: '部门 · id / dept_name' },
            {
              name: 'department_employee',
              rows: totals.assignmentRecords,
              desc: '员工–部门任职区间',
            },
            {
              name: 'department_manager',
              rows: totals.managerRecords,
              desc: '部门–经理任职区间',
            },
            { name: 'salary', rows: totals.salaryRecords, desc: '薪资历史 · amount / 生效区间' },
            { name: 'title', rows: totals.titleRecords, desc: '职衔历史 · title / 生效区间' },
          ].map((table) => (
            <div key={table.name} className="bg-paper-raised p-4">
              <div className="flex items-baseline justify-between gap-2">
                <code className="truncate font-mono text-[12px] text-ink">{table.name}</code>
                <span className="shrink-0 font-mono text-[10.5px] tabular text-ink-faint">
                  {fmtCompact(table.rows)}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-ink-soft">{table.desc}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 检索                                                                */
/* ------------------------------------------------------------------ */

function SearchPanel() {
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
    <Section
      index="09"
      title="查一个人"
      lede="按工号精确查，或按姓 / 名的片段模糊查。查询直接打到 Neon，返回当前职衔、部门与薪酬。"
      aside={
        <button
          type="button"
          onClick={() => {
            setTerm('')
            inputRef.current?.focus()
          }}
          className="text-[11px] text-ink-soft underline-offset-2 transition hover:text-ink hover:underline"
        >
          清空
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="例如 43624、Pesch、Tokuyasu"
          className="w-full rounded-sm border border-rule-strong bg-paper-raised px-3.5 py-2.5 font-mono text-[13px] text-ink outline-none transition placeholder:font-sans placeholder:text-ink-faint focus:border-ink/40"
        />

        {state === 'idle' ? (
          <p className="text-[12px] text-ink-faint">输入关键字开始检索。</p>
        ) : state === 'loading' ? (
          <p className="text-[12px] text-ink-faint">查询中…</p>
        ) : error ? (
          <p className="text-[12px] text-danger">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-ink-faint">没有匹配的员工。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule-strong">
                  <Th>工号</Th>
                  <Th>姓名</Th>
                  <Th>职衔</Th>
                  <Th>部门</Th>
                  <Th align="right">当前年薪</Th>
                  <Th align="right">入职</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-rule/70 transition-colors hover:bg-ink/[0.02]">
                    <td className="py-2.5 pr-4 font-mono text-[12px] tabular text-ink-faint">{row.id}</td>
                    <td className="py-2.5 pr-4 text-[13px] text-ink">
                      {row.name}
                      <span className="ml-1.5 font-mono text-[10px] text-ink-faint">{row.gender}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-[12.5px] text-ink-soft">{row.title ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-[12.5px] text-ink-soft">{row.department ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-[12.5px] tabular text-ink">
                      {row.salary === null ? '—' : fmtMoney(row.salary)}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[12px] tabular text-ink-faint">
                      {fmtDate(row.hireDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {truncated ? (
              <p className="mt-2 text-[11px] text-ink-faint">
                结果超过 25 条，只显示前 25 条。请输入更精确的关键字。
              </p>
            ) : null}
          </div>
        )}
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 小部件                                                              */
/* ------------------------------------------------------------------ */

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.16em] text-ink-faint uppercase">{label}</p>
      <p className="mt-2 text-[26px] leading-none font-semibold tabular tracking-tight text-ink">
        {value}
      </p>
      <p className="mt-1.5 text-[11.5px] text-ink-soft">{note}</p>
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: accent ? '#c2410c' : '#e7e4df' }}>
      <p className="font-mono text-[10px] tracking-[0.14em] text-ink-faint uppercase">{label}</p>
      <p className={`mt-1 font-mono text-[14px] tabular ${accent ? 'text-accent' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  )
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.16em] text-ink-faint uppercase">{term}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">{detail}</p>
    </div>
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
      className={`py-2 pr-4 font-mono text-[10px] font-normal tracking-[0.12em] text-ink-faint uppercase ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  )
}

function Unavailable({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-sm border border-rule-strong bg-paper-raised p-8">
      <p className="font-mono text-[10px] tracking-[0.16em] text-danger uppercase">连接失败</p>
      <p className="mt-3 text-[15px] font-medium text-ink">读不到 Neon 上的数据</p>
      <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ink-soft">{error ?? '未知错误'}</p>
      <p className="mt-3 max-w-xl text-[11.5px] leading-relaxed text-ink-faint">
        检查 Worker 的 <code className="font-mono text-ink-soft">CONNECTION_STRING</code> 是否指向 Neon 的{' '}
        <code className="font-mono text-ink-soft">neondb</code> 库。连接恢复后这里会自动显示实时数据；
        在此之前页面会回退到 D1 里的最近一次快照。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-sm bg-ink px-4 py-2 text-[12px] font-medium text-paper transition hover:bg-ink/85"
      >
        重新连接
      </button>
    </div>
  )
}
